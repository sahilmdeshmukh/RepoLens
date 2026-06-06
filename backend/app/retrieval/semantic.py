from qdrant_client.models import Filter, FieldCondition, MatchValue
from app.db.qdrant import get_qdrant, reset_qdrant, COLLECTION_NAME
from app.ingestion.embedder import embed_query

TOP_K = 10  # fetch more than we need — RRF (Task 12) will rerank and trim to top 5


def semantic_search(query: str, source_id: str) -> list[dict]:
    """
    Find the TOP_K chunks most semantically similar to the query,
    filtered to a specific source.

    WHY filter by source_id: users can have multiple repos indexed. We only
    want results from the one they're currently chatting with — otherwise
    answers would mix content from unrelated codebases.

    Returns list of {id, text, metadata, score} dicts, sorted by similarity score.
    """
    query_vector = embed_query(query)

    # Retry once on connection errors — Qdrant free tier drops idle connections
    for attempt in range(2):
        try:
            qdrant = get_qdrant()
            response = qdrant.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        query_filter=Filter(
            must=[FieldCondition(key="source_id", match=MatchValue(value=source_id))]
        ),
        limit=TOP_K,
                with_payload=True,
            )
            return [
                {
                    "id": str(r.id),
                    "text": r.payload.get("text", ""),
                    "metadata": {k: v for k, v in r.payload.items() if k != "text"},
                    "score": r.score,
                }
                for r in response.points
            ]
        except Exception as e:
            if attempt == 0:
                reset_qdrant()  # force fresh connection on retry
                continue
            raise
