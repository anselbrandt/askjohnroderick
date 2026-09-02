"""Turn a reply into audio, by asking the synthesis service for it.

The model itself lives in the podcast-diarization project, resident in its own
Python 3.12 environment because f5-tts cannot share a dependency tree with
either this backend or the pipeline. Here we only need httpx.

Two things happen before the text is spoken. Citations are stripped, because
"(rotl-634 at 45:10)" read aloud is noise rather than provenance -- it belongs
on screen, where it stays. And the text is split into speakable spans, because
the synthesizer degrades on long inputs and refuses past 600 characters.
"""

from __future__ import annotations

import io
import re
import wave

import httpx

from app.config import TTS_TIMEOUT_S, TTS_URL

# "(rotl-634 @ 45:10)" and the bare "@ 45:10" form.
CITATION = re.compile(r"\s*\(([a-z]+-\d+)\s*@\s*[\d:]+\)")
MARKDOWN = re.compile(r"[*_`#>]+")

MAX_CHARS = 560  # under the service's 600, with room for punctuation


class SpeechUnavailable(RuntimeError):
    """The synthesizer is not answering.

    Distinct from a reply with nothing to say: the text is on screen either
    way, and only the audio is missing, so this should degrade quietly rather
    than fail the turn.
    """


def speakable(text: str) -> str:
    """The reply as it should be heard rather than read."""
    spoken = CITATION.sub("", text)
    spoken = MARKDOWN.sub("", spoken)
    return re.sub(r"\s+", " ", spoken).strip()


def split_spans(text: str, limit: int = MAX_CHARS) -> list[str]:
    """Break text into spans the synthesizer will accept.

    Split on sentence ends, which is where the prosody resets anyway, so the
    joins land where a speaker would have paused. A single sentence longer than
    the limit is cut on a space rather than dropped.
    """
    spans: list[str] = []
    current = ""
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        while len(sentence) > limit:
            cut = sentence.rfind(" ", 0, limit) or limit
            spans.append(sentence[:cut].strip())
            sentence = sentence[cut:].strip()
        if len(current) + len(sentence) + 1 > limit:
            if current:
                spans.append(current.strip())
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        spans.append(current.strip())
    return [s for s in spans if s]


def join_wavs(chunks: list[bytes]) -> bytes:
    """Concatenate WAV payloads that share a format into one file."""
    if len(chunks) == 1:
        return chunks[0]
    out = io.BytesIO()
    with wave.open(io.BytesIO(chunks[0]), "rb") as first:
        params = first.getparams()
    with wave.open(out, "wb") as writer:
        writer.setparams(params)
        for chunk in chunks:
            with wave.open(io.BytesIO(chunk), "rb") as reader:
                writer.writeframes(reader.readframes(reader.getnframes()))
    return out.getvalue()


async def synthesize(text: str) -> bytes:
    """Speak `text`, returning one WAV.

    Spans are synthesized in sequence rather than concurrently: the service
    holds a single model on a single GPU and serialises them anyway, so
    parallel requests would only queue in a less obvious place.
    """
    spoken = speakable(text)
    if not spoken:
        raise SpeechUnavailable("nothing speakable in that reply")

    chunks: list[bytes] = []
    try:
        async with httpx.AsyncClient(timeout=TTS_TIMEOUT_S) as client:
            for span in split_spans(spoken):
                response = await client.post(f"{TTS_URL}/speak", json={"text": span})
                response.raise_for_status()
                chunks.append(response.content)
    except httpx.HTTPError as exc:
        raise SpeechUnavailable(f"{type(exc).__name__}: {exc}") from exc
    if not chunks:
        raise SpeechUnavailable("synthesizer returned nothing")
    return join_wavs(chunks)
