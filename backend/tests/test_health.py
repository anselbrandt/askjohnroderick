from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

# Nothing listens here, so a probe against it fails to connect the same way a
# stopped service does -- which is the case that matters, since that is what a
# reboot leaves behind.
DEAD = "http://127.0.0.1:9"


def services(body: dict) -> dict[str, dict]:
    return {service["name"]: service for service in body["services"]}


def test_health_reports_every_service(monkeypatch):
    """The indicator needs one row per dependency, whatever their state."""
    monkeypatch.setattr("app.routers.health.CORPUS_URL", DEAD)
    monkeypatch.setattr("app.routers.health.TTS_URL", DEAD)

    response = client.get("/health")
    assert response.status_code == 200

    body = response.json()
    assert [service["name"] for service in body["services"]] == [
        "api",
        "corpus",
        "tts",
    ]
    assert all(service["label"] for service in body["services"])


def test_unreachable_service_is_degraded_not_an_error(monkeypatch):
    """A down dependency must arrive as a report, not as a failed request.

    The whole point of the change: a non-2xx here would have the client throw
    the body away and show a bare failure, when what the reader needs is which
    service is missing.
    """
    monkeypatch.setattr("app.routers.health.CORPUS_URL", DEAD)
    monkeypatch.setattr("app.routers.health.TTS_URL", DEAD)

    response = client.get("/health")
    assert response.status_code == 200

    body = response.json()
    assert body["status"] == "degraded"
    assert services(body)["corpus"]["status"] == "down"
    assert services(body)["tts"]["status"] == "down"
    # The API answered, so it is not dragged down with its dependencies.
    assert services(body)["api"]["status"] == "ok"


def test_one_service_down_does_not_hide_the_others(monkeypatch):
    """A probe that raised used to take the whole report with it."""
    monkeypatch.setattr("app.routers.health.CORPUS_URL", DEAD)

    response = client.get("/health")
    assert response.status_code == 200

    body = response.json()
    assert services(body)["corpus"]["status"] == "down"
    # The live corpus is stubbed out above; TTS is not, so it reports for real.
    assert services(body)["tts"]["status"] in {"ok", "loading", "down"}
    assert services(body)["tts"]["detail"]


def test_loading_is_not_down(monkeypatch):
    """The synthesizer is "loading" for a minute after a restart.

    Reported as down, that would have someone restarting a service that is
    already on its way up.
    """

    class Response:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {"status": "loading"}

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc) -> None:
            return None

        async def get(self, url: str) -> Response:
            return Response()

    monkeypatch.setattr("app.routers.health.httpx.AsyncClient", lambda **kw: Client())

    body = client.get("/health").json()
    assert services(body)["tts"]["status"] == "loading"
    assert body["status"] == "degraded"
