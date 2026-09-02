"""Tools that let the agent read the John Roderick corpus.

The corpus itself lives in the podcast-diarization project and is served over
local HTTP: 2.6 GB of SQLite, a vector memmap, an embedding model and a
cross-encoder, none of which belong in a chat backend that reloads on every
file save. Here we only need `httpx`, which was already a dependency.

Each tool returns text shaped for a language model rather than JSON: passages
carry their episode, timestamp and speaker inline, so a citation is something
the model can copy rather than assemble.
"""

from __future__ import annotations

import httpx

from app.config import CORPUS_TIMEOUT_S, CORPUS_URL


class CorpusUnavailable(RuntimeError):
    """The retrieval service is not answering.

    Raised rather than returning an empty result, because "the corpus has
    nothing on this" and "the corpus could not be reached" must not look the
    same to the agent -- the first is an answer, the second is a failure.
    """


async def _get(path: str, params: dict) -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=CORPUS_TIMEOUT_S) as client:
            response = await client.get(f"{CORPUS_URL}{path}", params=params)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as exc:
        raise CorpusUnavailable(f"{type(exc).__name__}: {exc}") from exc


def _render(passages: list[dict]) -> str:
    if not passages:
        return "NO RESULTS. The corpus has nothing on this."
    lines = []
    for p in passages:
        head = f"[{p['episode_id']} @ {p['timestamp']}]"
        if p.get("title"):
            head += f" {p['title']}"
        if p.get("published_date"):
            head += f" ({p['published_date']})"
        lines.append(f"{head}\n{p.get('speaker') or 'UNKNOWN'}: {p['text']}")
    return "\n\n".join(lines)


async def search_corpus(
    query: str, limit: int = 6, speaker: str | None = None
) -> str:
    """Search everything said on the shows, on a topic.

    Use this for any question about a life, opinion, story or history. Returns
    passages with the episode and timestamp they came from. Prefer several
    narrow searches over one broad one -- a question about how a view changed
    needs separate searches, not a single query.

    `speaker` restricts results to who said it, and is what makes a bare name
    searchable. "Eleanor" alone returns Eleanor Roosevelt and Eleanor Rigby;
    "Eleanor" said by Merlin Mann returns him talking to his own child. Use it
    whenever you are checking whether a particular person uses a name.
    """
    params: dict[str, object] = {"q": query, "limit": limit}
    if speaker:
        params["speaker"] = speaker
    return _render(await _get("/search", params))


async def find_quote(phrase: str, limit: int = 6) -> str:
    """Find an exact phrase, verbatim.

    Use when the wording matters -- a catchphrase, a specific turn of phrase,
    or checking whether he ever actually said something. Exact-match search,
    so it finds what semantic search misses and returns nothing for a
    paraphrase.
    """
    return _render(await _get("/quote", {"phrase": phrase, "limit": limit}))


async def episode_context(episode_id: str, at_s: float, window_s: float = 90.0) -> str:
    """Read what was said around a moment in an episode.

    Use after a search to see what came before or after a passage, when a
    quote needs its surroundings to be fair.
    """
    return _render(
        await _get(
            "/episode",
            {"episode_id": episode_id, "at_s": at_s, "window_s": window_s},
        )
    )


def _render_relations(rows: list[dict]) -> str:
    if not rows:
        return "NO RESULTS. Nothing extracted about this person's relationships."
    lines = []
    for row in rows:
        who = row["name"] or f"(unnamed {row['relation']})"
        confidence = row.get("measured_precision", 0.0)
        span = ""
        if row.get("first_date"):
            span = f"  used {row['first_date']} to {row.get('last_date') or '?'}"
        lines.append(
            f"{row['speaker']} -- {row['relation']}: {who}{span}  "
            f"[this relation type is right about {confidence:.0%} of the time]"
        )
        for quote in row.get("evidence") or []:
            lines.append(f"    evidence: {quote}")
    return "\n".join(lines)


async def family(person: str, relation: str | None = None) -> str:
    """Names this person has been linked to as family, friends or colleagues.

    Use this when a question asks who someone's relative is by relationship
    rather than by name -- "what is X's daughter called" -- because the archive
    usually names people in passages that never mention the relationship. It is
    the only way to get from "Merlin Mann's child" to a name.

    Results are newest first, and each carries the years it was in use. A name
    that stops being used has usually been superseded rather than disproved,
    so read the spans before deciding which one answers the question.

    These are LEADS, NOT FACTS. Extraction is noisy and the reliability of each
    kind is reported inline: sibling and friend are usually right, child,
    parent and spouse usually are not. Read the evidence quote: "in my kids'
    class there's two Aidens" is a classmate, not a child. Then search the
    corpus for any name that looks plausible and cite what you find there --
    never cite this tool as the source for a name.
    """
    params: dict[str, str] = {"person": person}
    if relation:
        params["relation"] = relation
    return _render_relations(await _get("/relations", params))
