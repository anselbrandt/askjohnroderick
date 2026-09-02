from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import ORIGIN_REGEX, ORIGINS, ROOT_PATH
from app.routers import chat, health, speak

app = FastAPI(title="Ask John Roderick", root_path=ROOT_PATH)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_origin_regex=ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(chat.router)
app.include_router(speak.router)
