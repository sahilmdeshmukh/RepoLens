from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings  # importing this validates all env vars at startup
from app.db.sqlite import init_db
from app.db.qdrant import ensure_collection
from app.ingestion.router import router as ingestion_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()           # creates SQLite tables if they don't exist
    ensure_collection() # creates Qdrant collection if it doesn't exist
    yield
    # Shutdown hooks added here if needed


app = FastAPI(title="RepoLens API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(ingestion_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
