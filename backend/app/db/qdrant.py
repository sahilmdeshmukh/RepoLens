from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams
from app.config import settings

COLLECTION_NAME = "repolens_chunks"
EMBEDDING_DIM = 1536  # text-embedding-3-small outputs 1536-dimensional vectors

_client: QdrantClient | None = None


def _make_client() -> QdrantClient:
    return QdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key,
        timeout=60,  # Qdrant free tier drops idle connections — generous timeout
    )


def get_qdrant() -> QdrantClient:
    """Return a singleton Qdrant client, recreating it if the connection was dropped."""
    global _client
    if _client is None:
        _client = _make_client()
    return _client


def reset_qdrant():
    """Force a fresh connection on next call — call this after a connection error."""
    global _client
    _client = None


def ensure_collection():
    """Create the chunks collection and payload index if they don't exist yet."""
    client = get_qdrant()
    existing = [c.name for c in client.get_collections().collections]
    if COLLECTION_NAME not in existing:
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
        )
    try:
        client.create_payload_index(
            collection_name=COLLECTION_NAME,
            field_name="source_id",
            field_schema="keyword",
        )
    except Exception:
        pass  # index already exists
