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


async def search_corpus(query: str, limit: int = 6) -> str:
    """Search everything John Roderick has said on a topic.

    Use this for any question about his life, opinions, stories or history.
    Returns passages with the episode and timestamp they came from. Prefer
    several narrow searches over one broad one -- a question about how a view
    changed needs separate searches, not a single query.
    """
    return _render(await _get("/search", {"q": query, "limit": limit}))


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
