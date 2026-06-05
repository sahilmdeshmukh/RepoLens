from rank_bm25 import BM25Okapi
from app.db.sqlite import get_chunks_for_source

TOP_K = 10


def _tokenize(text: str) -> list[str]:
    """Simple whitespace + lowercase tokenizer. Works well for both code and prose."""
    return text.lower().split()


def keyword_search(query: str, source_id: str) -> list[dict]:
    """
    BM25 keyword search over all chunks for the given source.

    WHY BM25 (Best Match 25): it's the industry-standard keyword ranking algorithm.
    It scores documents by how often query terms appear, weighted by how rare those
    terms are across the whole corpus (IDF — inverse document frequency). A term
    like "authenticate" appearing in 2 out of 500 chunks scores higher than
    "return" which appears in every chunk.

    WHY rebuild the index per search: BM25 needs all documents in memory. We rebuild
    it from SQLite on each query (~50ms for hundreds of chunks). Acceptable for a
    portfolio project — production systems would cache the index per source.

    Returns list of {id, text, metadata, score} dicts ranked by BM25 score.
    """
    chunks = get_chunks_for_source(source_id)
    if not chunks:
        return []

    corpus = [_tokenize(c["text"]) for c in chunks]
    bm25 = BM25Okapi(corpus)

    query_tokens = _tokenize(query)
    scores = bm25.get_scores(query_tokens)

    # Pair each chunk with its score, sort descending, keep top K with score > 0
    ranked = sorted(zip(chunks, scores), key=lambda x: x[1], reverse=True)
    return [
        {"id": c["id"], "text": c["text"], "metadata": c["metadata"], "score": float(s)}
        for c, s in ranked[:TOP_K]
        if s > 0  # skip chunks with zero BM25 score (no matching terms at all)
    ]
