import os

from dotenv import load_dotenv

load_dotenv()

ROOT_PATH = os.getenv("ROOT_PATH", "")

ORIGINS = [
    "http://localhost:5173",
    "https://askjohnroderick.com",
    "https://www.askjohnroderick.com",
    "https://askjohnroderick.vercel.app",
]

# Vercel preview deployments get a generated hostname per build.
ORIGIN_REGEX = r"https://askjohnroderick-[a-z0-9]+-ansel-brandts-projects\.vercel\.app"
