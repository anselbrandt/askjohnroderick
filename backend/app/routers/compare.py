"""Every voice the site has served, for side-by-side listening.

The page at /compare lists the versions and sends the same text to each. The
versions themselves -- checkpoint, reference clip, lexicon, serving options --
are defined by podcast-tts-compare in the podcast-diarization project; this
only relays, behind the same allowlist as /speak.
"""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.access import allowlisted
from app.config import TTS_COMPARE_URL
from app.speech import SpeechUnavailable, synthesize

router = APIRouter(
    prefix="/compare", tags=["compare"], dependencies=[Depends(allowlisted)]
)


class CompareRequest(BaseModel):
    text: str
    version: str


@router.get("/versions")
async def versions() -> list[dict[str, str]]:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"{TTS_COMPARE_URL}/versions")
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(503, f"compare service unavailable: {exc}") from exc
    return response.json()


@router.post("/speak")
async def speak(body: CompareRequest) -> Response:
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="text must not be empty")
    try:
        audio = await synthesize(
            body.text, url=TTS_COMPARE_URL, extra={"version": body.version}
        )
    except SpeechUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return Response(content=audio, media_type="audio/wav")
