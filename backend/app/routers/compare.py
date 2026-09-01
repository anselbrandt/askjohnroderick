"""Side-by-side: the same question answered with and without the archive.

Both arms run concurrently and stream into one SSE channel, each delta tagged
with which arm produced it, so the client can render two columns that fill in
together. Interleaving rather than running in sequence matters: the grounded
arm makes tool calls and is slower, and a reader comparing two answers should
watch them race, not wait.

Failure is per-arm. If retrieval is down the grounded side reports that and the
plain side still answers, because half a comparison is more useful than an
error page -- and the reader can see exactly which half is missing.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.access import allowlisted
from app.agents import grounded, plain
from app.corpus import CorpusUnavailable

router = APIRouter(prefix="/compare", tags=["compare"], dependencies=[Depends(allowlisted)])

Arm = Literal["plain", "grounded"]


class CompareRequest(BaseModel):
    question: str


def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


async def _run(arm: Arm, agent, question: str, out: asyncio.Queue) -> None:
    """Stream one arm's answer into the shared queue, tagged by arm.

    `run_stream_events` rather than `run_stream`: the latter streams a single
    model response, so an agent that calls a tool streams its preamble, goes
    quiet to search, and the answer never arrives. The event stream covers the
    whole run -- text, tool calls, and the text that follows them.

    Tool calls are surfaced rather than hidden. Watching the grounded arm say
    what it is searching for is most of what makes the comparison readable.
    """
    from pydantic_ai import (
        FunctionToolCallEvent,
        PartDeltaEvent,
        PartStartEvent,
        TextPart,
        TextPartDelta,
    )

    try:
        async with agent.run_stream_events(question) as events:
            async for event in events:
                if isinstance(event, PartStartEvent) and isinstance(event.part, TextPart):
                    if event.part.content:
                        await out.put({"arm": arm, "delta": event.part.content})
                elif isinstance(event, PartDeltaEvent) and isinstance(
                    event.delta, TextPartDelta
                ):
                    if event.delta.content_delta:
                        await out.put({"arm": arm, "delta": event.delta.content_delta})
                elif isinstance(event, FunctionToolCallEvent):
                    await out.put({
                        "arm": arm,
                        "tool": event.part.tool_name,
                        "args": str(event.part.args)[:200],
                    })
        await out.put({"arm": arm, "done": True})
    except CorpusUnavailable as exc:
        # Named separately so the reader can tell "the archive knows nothing"
        # from "the archive could not be reached".
        await out.put({"arm": arm, "error": f"corpus unavailable: {exc}"})
    except Exception as exc:  # noqa: BLE001 - headers are sent, report in-band
        await out.put({"arm": arm, "error": f"{type(exc).__name__}: {exc}"})


@router.post("")
async def compare(body: CompareRequest) -> StreamingResponse:
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="question must not be empty")

    async def events() -> AsyncIterator[str]:
        queue: asyncio.Queue = asyncio.Queue()
        arms = {"plain": plain, "grounded": grounded}
        tasks = [
            asyncio.create_task(_run(name, agent, question, queue))
            for name, agent in arms.items()
        ]
        finished = 0
        try:
            while finished < len(tasks):
                event = await queue.get()
                if event.get("done") or event.get("error"):
                    finished += 1
                yield sse(event)
            yield sse({"done": True})
        finally:
            for task in tasks:
                task.cancel()

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
