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

# "(rotl-634 @ 45:10)" -- the old inline form, still stripped so a reply
# written before the footnote change does not get read out as coordinates.
CITATION = re.compile(r"\s*\(([a-z]+-\d+)\s*@\s*[\d:]+\)")
MARKDOWN = re.compile(r"[*_`#>]+")

SUPERSCRIPTS = "\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079"

# A footnote line: a superscript marker, then the source. Matched anchored to
# the line so a superscript inside a sentence is not mistaken for one.
FOOTNOTE_LINE = re.compile(
    rf"^[{SUPERSCRIPTS}]+[^\S\n]*[a-z0-9-]+\s*@\s*[\d:]+\s*$", re.MULTILINE
)
MARKER = re.compile(rf"[{SUPERSCRIPTS}]+")

MAX_CHARS = 560  # under the service's 600, with room for punctuation


class SpeechUnavailable(RuntimeError):
    """The synthesizer is not answering.

    Distinct from a reply with nothing to say: the text is on screen either
    way, and only the audio is missing, so this should degrade quietly rather
    than fail the turn.
    """


def speakable(text: str) -> str:
    """The reply as it should be heard rather than read.

    Citations are for the eye. The footnote block at the end is dropped
    outright, and the superscript markers in the prose go with it -- read
    aloud they are just digits interrupting a sentence, and "the paradise that
    it is, frankly, three" is worse than no citation at all.

    The markers are removed rather than replaced with a pause: they sit
    against the word they cite, and a gap there would break the phrase in a
    place a speaker never would.
    """
    spoken = FOOTNOTE_LINE.sub("", text)
    spoken = CITATION.sub("", spoken)
    spoken = MARKER.sub("", spoken)
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
