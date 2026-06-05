from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings  # importing this validates all env vars at startup
from app.db.sqlite import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()  # creates tables if they don't exist
    yield
    # Shutdown hooks added here if needed


app = FastAPI(title="RepoLens API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}
