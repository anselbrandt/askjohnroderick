import os

from dotenv import load_dotenv

load_dotenv()

ROOT_PATH = os.getenv("ROOT_PATH", "")

MODEL = os.getenv("MODEL", "anthropic:claude-opus-5")

# Comma-separated public IPs allowed to use /chat. Empty means open to all.
ALLOWED_IPS = {
    ip.strip() for ip in os.getenv("ALLOWED_IPS", "").split(",") if ip.strip()
}

# The retrieval service from the podcast-diarization project. Local by design:
# it holds a private archive and has no authentication of its own.
CORPUS_URL = os.getenv("CORPUS_URL", "http://127.0.0.1:8003")

# Reranking a query costs a few seconds on a warm service and much longer on a
# cold one, and an agent may search several times per answer.
CORPUS_TIMEOUT_S = float(os.getenv("CORPUS_TIMEOUT_S", "120"))

ORIGINS = [
    "http://localhost:5173",
    "https://askjohnroderick.com",
    "https://www.askjohnroderick.com",
    "https://askjohnroderick.vercel.app",
]

# Vercel preview deployments get a generated hostname per build.
ORIGIN_REGEX = r"https://askjohnroderick-[a-z0-9]+-ansel-brandts-projects\.vercel\.app"

# The synthesis service in the podcast-diarization project. Local only: it
# holds a voice model of a real person and has no authentication.
TTS_URL = os.getenv("TTS_URL", "http://127.0.0.1:8004")
TTS_TIMEOUT_S = float(os.getenv("TTS_TIMEOUT_S", "180"))
