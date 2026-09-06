import json
from collections.abc import AsyncIterator
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pydantic_ai import PartDeltaEvent, PartStartEvent
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    TextPart,
    TextPartDelta,
    UserPromptPart,
)

from app import turnlog
from app.access import allowlisted
from app.agent import agent
from app.corpus import CorpusUnavailable

router = APIRouter(prefix="/chat", tags=["chat"], dependencies=[Depends(allowlisted)])


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]
    # Groups turns into a conversation. Client-supplied because the server has
    # no session of its own; absent, turns are still logged, just unlinked.
    session_id: str | None = None


def to_history(messages: list[Message]) -> list[ModelMessage]:
    """Rebuild pydantic-ai history from the transcript the client holds."""
    history: list[ModelMessage] = []
    for message in messages:
        if message.role == "user":
            history.append(
                ModelRequest(parts=[UserPromptPart(content=message.content)])
            )
        else:
            history.append(ModelResponse(parts=[TextPart(content=message.content)]))
    return history


def text_delta(event: object) -> str | None:
    """The prose an event carries, if it carries any.

    The event stream also reports tool calls and their returns; this route
    shows only what the reader is meant to read.
    """
    if isinstance(event, PartStartEvent) and isinstance(event.part, TextPart):
        return event.part.content or None
    if isinstance(event, PartDeltaEvent) and isinstance(event.delta, TextPartDelta):
        return event.delta.content_delta or None
    return None


def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


@router.post("")
async def chat(body: ChatRequest) -> StreamingResponse:
    if not body.messages or body.messages[-1].role != "user":
        raise HTTPException(
            status_code=400, detail="last message must be from the user"
        )

    *history, latest = body.messages

    # Set for the request so the corpus tools record themselves into it. What
    # was asked, what was searched, and what came back is the raw material for
    # every later improvement to retrieval, and it has been discarded until now.
    turn = turnlog.Turn(
        session_id=body.session_id or "unlinked", question=latest.content
    )
    turnlog.current.set(turn)

    async def events() -> AsyncIterator[str]:
        """Stream the answer, including the text that follows a tool call.

        `run_stream_events` rather than `run_stream`: the latter streams a
        single model response, so an agent that searches the corpus streams its
        preamble, goes quiet to search, and the real answer never arrives. It
        does not look like a truncation from the client -- it looks like a
        short reply -- which is what makes it worth pinning here.
        """
        spoken: list[str] = []
        failure: str | None = None
        try:
            async with agent.run_stream_events(
                latest.content, message_history=to_history(history)
            ) as stream:
                async for event in stream:
                    delta = text_delta(event)
                    if delta:
                        spoken.append(delta)
                        yield sse({"delta": delta})
            yield sse({"done": True})
        except CorpusUnavailable as exc:
            # Distinct from a general failure: the archive being unreachable
            # means this route cannot answer at all, since it may not fall back
            # on what the model already knows.
            failure = f"corpus unavailable: {exc}"
            yield sse({"error": f"the archive is unreachable: {exc}"})
        except Exception as exc:  # noqa: BLE001 - headers are sent, report in-band
            failure = f"{type(exc).__name__}: {exc}"
            yield sse({"error": f"{type(exc).__name__}: {exc}"})
        finally:
            # After the reply is delivered, and swallowing its own failures: a
            # bug in logging must not cost a reader their answer.
            turnlog.save(turn, "".join(spoken), failure)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
