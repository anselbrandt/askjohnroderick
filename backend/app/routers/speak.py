"""Audio for a reply the reader already has on screen.

Deliberately a separate request rather than part of the chat stream. The text
arrives token by token and should keep doing so; audio needs a whole sentence
before it can say anything, and waiting for it would make the reply feel
slower than it is. So the transcript renders as it always did, and this is
asked for afterwards -- by a play button, or automatically when the reader has
sound turned on.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.access import allowlisted
from app.speech import SpeechUnavailable, synthesize

router = APIRouter(prefix="/speak", tags=["speak"], dependencies=[Depends(allowlisted)])


class SpeakRequest(BaseModel):
    text: str


@router.post("")
async def speak(body: SpeakRequest) -> Response:
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="text must not be empty")
    try:
        audio = await synthesize(body.text)
    except SpeechUnavailable as exc:
        # 503 rather than 500: the reply is fine and on screen, the voice is
        # what is missing, and the client should fall back to silence.
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return Response(content=audio, media_type="audio/wav")
