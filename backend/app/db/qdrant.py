from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams
from app.config import settings

COLLECTION_NAME = "repolens_chunks"
EMBEDDING_DIM = 1536  # text-embedding-3-small outputs 1536-dimensional vectors


_client: QdrantClient | None = None


def get_qdrant() -> QdrantClient:
    """Return a singleton Qdrant client — one connection shared across the app."""
    global _client
    if _client is None:
        _client = QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key)
    return _client


def ensure_collection():
    """Create the chunks collection if it doesn't exist yet."""
    client = get_qdrant()
    existing = [c.name for c in client.get_collections().collections]
    if COLLECTION_NAME not in existing:
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
        )
