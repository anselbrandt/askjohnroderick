"""Tracing for the chat backend.

The turn log answers what was asked and which passages came back. It cannot
answer why one question took fifty-three seconds, what the model was actually
sent, or what any of it cost -- those live in spans, and this is where they
come from.

Deliberately optional. `send_to_logfire="if-token-present"` means an absent
token turns instrumentation into a no-op rather than an error, so a missing
credential cannot take down the service. Observability that can break the
thing it observes is a bad trade.

Not instrumented: SQLAlchemy, because nothing here uses it -- the turn log and
the corpus both speak sqlite3 directly.
"""

from __future__ import annotations

from typing import Any

SERVICE_NAME = "askjohnroderick-backend"


def configure(app: Any) -> bool:
    """Instrument the app. Returns whether tracing is actually on.

    Every failure is swallowed. This runs at import time on a service that has
    to start whether or not an observability backend is reachable.
    """
    try:
        import logfire

        logfire.configure(
            service_name=SERVICE_NAME,
            # No token, no tracing, no error.
            send_to_logfire="if-token-present",
        )
        # Agent runs, tool calls, and the model messages either side of them.
        logfire.instrument_pydantic_ai()
        logfire.instrument_fastapi(app)
        # The corpus calls. Instrumented here and not in the pipeline's CLI,
        # where httpx also fetches private feeds with a credential in the URL.
        logfire.instrument_httpx()
        logfire.instrument_system_metrics()
        return True
    except Exception:  # noqa: BLE001 - the service must start regardless
        return False
