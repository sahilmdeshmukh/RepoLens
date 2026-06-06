import base64
import uuid
from pathlib import Path
import httpx
from app.config import settings
from app.ingestion.chunker import chunk_code, chunk_markdown
from app.ingestion.embedder import embed_texts
from app.db.sqlite import insert_chunk, update_source_status
from app.db.qdrant import get_qdrant, COLLECTION_NAME
from qdrant_client.models import PointStruct

# Maps file extension → language name our chunker understands
CODE_EXTENSIONS = {
    ".py": "python",
    ".js": "javascript",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".go": "go",
}
DOC_EXTENSIONS = {".md", ".mdx"}

# Directories to skip entirely — no useful code to index here
SKIP_DIRS = {"node_modules", ".git", "__pycache__", "dist", "build", ".venv", "venv"}

MAX_FILE_SIZE_BYTES = 100_000  # skip files larger than 100KB — usually generated/minified
MAX_FILES = 150  # cap files per repo to keep indexing fast (covers most meaningful code)


def _github_headers() -> dict:
    headers = {"Accept": "application/vnd.github+json"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"
    return headers


def _parse_repo_url(url: str) -> tuple[str, str]:
    """
    Extract owner and repo name from a GitHub URL.
    Handles: https://github.com/owner/repo  or  https://github.com/owner/repo.git
    """
    url = url.rstrip("/")
    if url.endswith(".git"):
        url = url[:-4]  # removesuffix — safe, doesn't strip individual chars
    parts = url.split("/")
    return parts[-2], parts[-1]


def _list_repo_files(owner: str, repo: str) -> list[dict]:
    """
    Fetch the full recursive file tree using GitHub's Git Trees API.

    WHY Git Trees API over Contents API: the Contents API requires one request
    per directory. The Trees API returns ALL files in one request with ?recursive=1,
    which is much faster for large repos.
    """
    url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/HEAD?recursive=1"
    resp = httpx.get(url, headers=_github_headers(), timeout=30, follow_redirects=True)
    resp.raise_for_status()
    tree = resp.json().get("tree", [])
    return [f for f in tree if f["type"] == "blob"]  # blobs are files, trees are directories


def _fetch_file_content(owner: str, repo: str, path: str) -> str | None:
    """
    Fetch a single file's content via the GitHub Contents API.
    Returns decoded text or None if the file should be skipped.

    WHY base64: GitHub returns file content as base64-encoded string in JSON.
    This avoids binary data in JSON responses.
    """
    url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"
    resp = httpx.get(url, headers=_github_headers(), timeout=15, follow_redirects=True)
    if resp.status_code != 200:
        return None
    data = resp.json()
    if data.get("size", 0) > MAX_FILE_SIZE_BYTES:
        return None
    content_b64 = data.get("content", "")
    return base64.b64decode(content_b64).decode("utf-8", errors="ignore")


def ingest_github_repo(source_id: str, repo_url: str):
    """
    Full pipeline: list files → fetch content → chunk → embed → store.

    This runs in a background task (see ingestion/router.py) so it doesn't
    block the HTTP response. The client polls GET /sources/{id} to track progress.
    """
    try:
        update_source_status(source_id, "processing")
        owner, repo = _parse_repo_url(repo_url)
        files = _list_repo_files(owner, repo)

        all_chunks = []
        indexed_count = 0
        for file in files:
            if indexed_count >= MAX_FILES:
                break
            path = file["path"]

            # Skip unwanted directories
            path_parts = Path(path).parts
            if any(d in SKIP_DIRS for d in path_parts):
                continue

            ext = Path(path).suffix.lower()
            language = CODE_EXTENSIONS.get(ext)
            is_doc = ext in DOC_EXTENSIONS

            if not language and not is_doc:
                continue  # not a file type we support

            content = _fetch_file_content(owner, repo, path)
            if not content:
                continue

            indexed_count += 1
            raw_chunks = chunk_code(content, language) if language else chunk_markdown(content)

            for raw in raw_chunks:
                chunk_id = str(uuid.uuid4())
                metadata = {
                    "source": "github",
                    "repo_url": repo_url,
                    "file_path": path,
                    "language": language or "markdown",
                    "start_line": raw.get("start_line"),
                    "end_line": raw.get("end_line"),
                    "chunk_type": raw["chunk_type"],
                }
                all_chunks.append({
                    "id": chunk_id,
                    "source_id": source_id,
                    "text": raw["text"],
                    "metadata": metadata,
                })

        if not all_chunks:
            update_source_status(source_id, "failed", error="No indexable files found")
            return

        # Embed all chunks in batches — this is the expensive OpenAI API call
        texts = [c["text"] for c in all_chunks]
        embeddings = embed_texts(texts)

        # Upsert into Qdrant in batches to avoid connection timeouts
        qdrant = get_qdrant()
        points = [
            PointStruct(
                id=c["id"],
                vector=emb,
                payload={**c["metadata"], "source_id": source_id, "text": c["text"]},
            )
            for c, emb in zip(all_chunks, embeddings)
        ]
        batch_size = 100
        for i in range(0, len(points), batch_size):
            qdrant.upsert(collection_name=COLLECTION_NAME, points=points[i:i + batch_size])

        # Store chunk text in SQLite for BM25 keyword search (Task 11)
        for chunk in all_chunks:
            insert_chunk(chunk)

        update_source_status(source_id, "complete", chunk_count=len(all_chunks))

    except Exception as e:
        update_source_status(source_id, "failed", error=str(e))
        raise
