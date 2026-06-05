from openai import OpenAI
from app.config import settings

EMBEDDING_MODEL = "text-embedding-3-small"
BATCH_SIZE = 100  # OpenAI allows up to 2048 inputs per call; 100 is a safe batch size

_client: OpenAI | None = None


def get_openai() -> OpenAI:
    """Singleton OpenAI client — one connection reused across all calls."""
    global _client
    if _client is None:
        _client = OpenAI(api_key=settings.openai_api_key)
    return _client


def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Embed a list of texts and return their vectors.

    WHY batching: sending 100 texts in one API call is ~100x faster than
    100 individual calls. Each HTTP round-trip has overhead (DNS, TLS handshake,
    queuing). Batching amortizes that cost across many texts at once.

    Returns a list of vectors in the same order as the input texts.
    """
    client = get_openai()
    all_embeddings = []

    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i:i + BATCH_SIZE]
        response = client.embeddings.create(model=EMBEDDING_MODEL, input=batch)
        # Sort by index to guarantee order — API doesn't guarantee response order
        embeddings = [item.embedding for item in sorted(response.data, key=lambda x: x.index)]
        all_embeddings.extend(embeddings)

    return all_embeddings


def embed_query(text: str) -> list[float]:
    """
    Embed a single query string.

    WHY same model as chunks: embedding similarity only makes sense when both
    vectors come from the same model. Mixing models produces meaningless scores.
    """
    return embed_texts([text])[0]
