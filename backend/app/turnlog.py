"""What was asked, what was searched, and what came back.

Every improvement to retrieval this project has made came from a bad answer
being noticed and discussed, and none of it was written down. This is the
table those conversations should have been.

Three properties it has to keep:

Off the request path. The log is written after the reply has finished
streaming, and a failure here is swallowed. Losing a log row is a nuisance;
losing an answer because logging broke is not acceptable.

Its own database. Not the corpus. The transcript layer is reproducible from
audio and is the only thing citable; this is neither, and keeping them in
separate files makes that structural rather than a matter of discipline. It
also keeps the weekly pipeline's write transactions away from the chat app.

Passages, not just text. A tool call records which passages it returned, so a
later pass can ask which of them the answer actually cited -- that difference
is the label that makes the rest of the plan possible.
"""

from __future__ import annotations

import contextvars
import json
import re
import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "turns.sqlite3"

SCHEMA = """
CREATE TABLE IF NOT EXISTS turn (
    id            INTEGER PRIMARY KEY,
    session_id    TEXT NOT NULL,
    seq           INTEGER NOT NULL,
    asked_at      TEXT NOT NULL,
    question      TEXT NOT NULL,
    answer        TEXT,
    -- Parsed out of the footnote block: [{episode_id, timestamp}].
    citations     TEXT,
    n_citations   INTEGER,
    duration_ms   INTEGER,
    error         TEXT
);

CREATE INDEX IF NOT EXISTS turn_session ON turn(session_id, seq);

CREATE TABLE IF NOT EXISTS tool_call (
    id            INTEGER PRIMARY KEY,
    turn_id       INTEGER NOT NULL REFERENCES turn(id) ON DELETE CASCADE,
    seq           INTEGER NOT NULL,
    tool          TEXT NOT NULL,
    args          TEXT,
    n_results     INTEGER,
    -- "episode_id@start_s" per result, in rank order, so a later pass can ask
    -- which returned passages the answer went on to cite and which it ignored.
    passages      TEXT,
    duration_ms   INTEGER,
    error         TEXT
);

CREATE INDEX IF NOT EXISTS tool_call_turn ON tool_call(turn_id, seq);

CREATE TABLE IF NOT EXISTS feedback (
    id            INTEGER PRIMARY KEY,
    turn_id       INTEGER REFERENCES turn(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL,
    detail        TEXT,
    created_at    TEXT NOT NULL
);
"""

# "(rotl-634 @ 45:10)" inline, and the footnote form at the end of a reply.
CITATION = re.compile(r"([a-z][a-z0-9]*-\d+)\s*@\s*(\d{1,2}:\d{2}(?::\d{2})?)")


@dataclass
class ToolCall:
    tool: str
    args: dict[str, Any]
    n_results: int = 0
    passages: list[str] = field(default_factory=list)
    duration_ms: int = 0
    error: str | None = None


@dataclass
class Turn:
    """Collects one turn's activity while it happens."""

    session_id: str
    question: str
    started: float = field(default_factory=time.monotonic)
    calls: list[ToolCall] = field(default_factory=list)


# Set for the duration of a request so the corpus tools can record themselves
# without taking a logging parameter. Their signatures are the schema the model
# sees, and a logging argument there would be one more thing it could get wrong.
current: contextvars.ContextVar[Turn | None] = contextvars.ContextVar(
    "current_turn", default=None
)


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def record(call: ToolCall) -> None:
    """Attach a finished tool call to the turn in progress, if there is one."""
    turn = current.get()
    if turn is not None:
        turn.calls.append(call)


def citations(answer: str) -> list[dict[str, str]]:
    seen: set[tuple[str, str]] = set()
    out = []
    for episode, stamp in CITATION.findall(answer or ""):
        if (episode, stamp) in seen:
            continue
        seen.add((episode, stamp))
        out.append({"episode_id": episode, "timestamp": stamp})
    return out


def save(turn: Turn, answer: str, error: str | None = None) -> int | None:
    """Write the turn and its calls. Returns the turn id, or None if it failed.

    Swallows everything. This runs after the reply has been delivered, and no
    fault in it should surface to a reader who already has their answer.
    """
    try:
        conn = connect()
        try:
            with conn:
                seq = conn.execute(
                    "SELECT coalesce(max(seq), 0) + 1 FROM turn WHERE session_id = ?",
                    (turn.session_id,),
                ).fetchone()[0]
                found = citations(answer)
                cursor = conn.execute(
                    "INSERT INTO turn (session_id, seq, asked_at, question, answer, "
                    "citations, n_citations, duration_ms, error) "
                    "VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)",
                    (
                        turn.session_id,
                        seq,
                        turn.question,
                        answer,
                        json.dumps(found),
                        len(found),
                        int((time.monotonic() - turn.started) * 1000),
                        error,
                    ),
                )
                turn_id = cursor.lastrowid
                for index, call in enumerate(turn.calls, start=1):
                    conn.execute(
                        "INSERT INTO tool_call (turn_id, seq, tool, args, n_results, "
                        "passages, duration_ms, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (
                            turn_id,
                            index,
                            call.tool,
                            json.dumps(call.args)[:2000],
                            call.n_results,
                            json.dumps(call.passages[:50]),
                            call.duration_ms,
                            call.error,
                        ),
                    )
            return turn_id
        finally:
            conn.close()
    except Exception:  # noqa: BLE001 - logging must never break a delivered answer
        return None
