"""What the frontend's indicator is actually reporting.

This used to return a hardcoded `{"status": "ok"}`, which proved only that
FastAPI was running. The corpus service sat down after a reboot on 2026-09-08
and the light stayed green for a week: every question failed with "the archive
is unreachable" while the one thing meant to warn about it could not see that
far. So each service the chat depends on is probed here, and reported by name.
"""

from __future__ import annotations

import asyncio
from typing import Literal

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from app.config import CORPUS_URL, TTS_URL

router = APIRouter(
    prefix="/health",
    tags=["health"],
)

# Deliberately not CORPUS_TIMEOUT_S. That is 120 seconds, sized for a cold
# rerank, and an indicator that waits two minutes to admit a service is down
# is not an indicator. A health endpoint either answers immediately or is
# itself the outage.
PROBE_TIMEOUT_S = 3.0

Status = Literal["ok", "loading", "down"]


class Service(BaseModel):
    """One dependency, as the indicator should show it."""

    name: str
    # Carried by the API rather than the client so that adding a service here
    # is the whole change -- the frontend renders whatever this list contains.
    label: str
    status: Status
    # A short human line for the tooltip: the corpus size, or why it is down.
    detail: str | None = None


class Health(BaseModel):
    # "degraded", not "down": the API answered, and chat may still work
    # depending on which dependency is missing. 200 either way, because the
    # body is the report -- a non-2xx would make the client throw it away and
    # show a bare failure instead of saying which service is gone.
    status: Literal["ok", "degraded"]
    services: list[Service]


def _corpus_detail(body: dict) -> str:
    episodes = body.get("episodes")
    utterances = body.get("utterances")
    if not isinstance(episodes, int) or not isinstance(utterances, int):
        return "reachable"
    return f"{episodes:,} episodes, {utterances:,} utterances"


async def _probe(name: str, label: str, url: str) -> Service:
    """Ask a service how it is, and never raise.

    A probe that throws takes the whole report with it, and the report is the
    point: one service being unreachable must not hide the status of the rest.
    """
    try:
        async with httpx.AsyncClient(timeout=PROBE_TIMEOUT_S) as client:
            response = await client.get(f"{url}/health")
            response.raise_for_status()
            body = response.json()
    except httpx.HTTPError as exc:
        return Service(
            name=name, label=label, status="down", detail=f"{type(exc).__name__}"
        )
    except ValueError:
        return Service(name=name, label=label, status="down", detail="bad response")

    if not isinstance(body, dict):
        return Service(name=name, label=label, status="down", detail="bad response")

    # The synthesizer answers "loading" if it is asked before its checkpoint is
    # resident: not broken, not ready, and not something to go restarting.
    #
    # Rarely seen, though. Measured across a restart, the port does not accept
    # until the model is up, so the twenty seconds of loading read as down and
    # then flip straight to ok. Handled because the service reports it, not
    # because it is the normal way up.
    if body.get("status") == "loading":
        return Service(name=name, label=label, status="loading", detail="warming up")

    detail = _corpus_detail(body) if name == "corpus" else "ready"
    return Service(name=name, label=label, status="ok", detail=detail)


@router.get("")
async def health() -> Health:
    # Concurrently: the probes are independent, and a serial sweep would make
    # the endpoint as slow as the sum of whatever is worst.
    services = [
        # The API needs no probe -- this handler running is the evidence.
        Service(name="api", label="API", status="ok", detail="ready"),
        *await asyncio.gather(
            _probe("corpus", "Archive", CORPUS_URL),
            _probe("tts", "Voice", TTS_URL),
        ),
    ]
    degraded = any(service.status != "ok" for service in services)
    return Health(status="degraded" if degraded else "ok", services=services)
