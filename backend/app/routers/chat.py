import json
from collections.abc import AsyncIterator
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    TextPart,
    UserPromptPart,
)

from app.access import allowlisted
from app.agent import agent

router = APIRouter(prefix="/chat", tags=["chat"], dependencies=[Depends(allowlisted)])


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]


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


def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


@router.post("")
async def chat(body: ChatRequest) -> StreamingResponse:
    if not body.messages or body.messages[-1].role != "user":
        raise HTTPException(
            status_code=400, detail="last message must be from the user"
        )

    *history, latest = body.messages

    async def events() -> AsyncIterator[str]:
        try:
            async with agent.run_stream(
                latest.content, message_history=to_history(history)
            ) as result:
                # debounce_by=None yields each chunk as it lands, for smooth typing
                async for delta in result.stream_text(delta=True, debounce_by=None):
                    yield sse({"delta": delta})
            yield sse({"done": True})
        except Exception as exc:  # noqa: BLE001 - headers are sent, report in-band
            yield sse({"error": f"{type(exc).__name__}: {exc}"})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
