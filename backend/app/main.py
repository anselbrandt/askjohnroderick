from dotenv import load_dotenv
from fastapi import FastAPI

from .routers import health

load_dotenv()

app = FastAPI(title="Ask John Roderick")

app.include_router(health.router)
