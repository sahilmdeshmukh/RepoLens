import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from app.db.sqlite import insert_source, get_all_sources, get_source
from app.ingestion.github import ingest_github_repo
from app.ingestion.api_docs import ingest_api_docs

router = APIRouter(prefix="/ingest", tags=["ingestion"])


class IngestRequest(BaseModel):
    url: str
    source_type: str  # "github" or "api_docs"


@router.post("")
async def start_ingestion(req: IngestRequest, background_tasks: BackgroundTasks):
    """
    Start indexing a GitHub repo or API docs site.

    Returns immediately with a source_id — actual indexing runs in the background.
    The client polls GET /ingest/sources/{id} to track progress.

    WHY BackgroundTasks: indexing can take minutes (fetching hundreds of files,
    calling OpenAI for embeddings). Blocking the HTTP response that long would
    time out. FastAPI's BackgroundTasks runs the work after the response is sent.
    """
    source_id = str(uuid.uuid4())

    # Use the last URL segment as the display name
    name = req.url.rstrip("/").split("/")[-1]

    insert_source({
        "id": source_id,
        "url": req.url,
        "source_type": req.source_type,
        "name": name,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    if req.source_type == "github":
        background_tasks.add_task(ingest_github_repo, source_id, req.url)
    elif req.source_type == "api_docs":
        background_tasks.add_task(ingest_api_docs, source_id, req.url)
    else:
        raise HTTPException(status_code=400, detail="source_type must be 'github' or 'api_docs'")

    return {"source_id": source_id, "status": "pending"}


@router.get("/sources")
async def list_sources():
    """Return all indexed sources ordered by most recent first."""
    return get_all_sources()


@router.get("/sources/{source_id}")
async def get_source_status(source_id: str):
    """Return the current status of a specific source."""
    source = get_source(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return source
