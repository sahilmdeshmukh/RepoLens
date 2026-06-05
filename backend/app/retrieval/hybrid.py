from app.retrieval.semantic import semantic_search
from app.retrieval.keyword import keyword_search

RRF_K = 60   # standard smoothing constant — prevents very top ranks from dominating
TOP_N = 5    # final number of chunks passed to the chat pipeline


def reciprocal_rank_fusion(ranked_lists: list[list[str]], k: int = RRF_K) -> list[str]:
    """
    Merge multiple ranked lists of chunk IDs into one ranked list.

    WHY RRF instead of score averaging: semantic scores (cosine similarity, 0-1)
    and BM25 scores (0-15+) are on completely different scales — you can't average
    them meaningfully. RRF only uses rank position, making it model-agnostic.
    A chunk ranked #2 by both systems beats one ranked #1 by only one system.
    """
    scores: dict[str, float] = {}
    for ranked_list in ranked_lists:
        for rank, doc_id in enumerate(ranked_list):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
    return sorted(scores, key=lambda x: scores[x], reverse=True)


def hybrid_search(query: str, source_id: str) -> list[dict]:
    """
    Run semantic + keyword search, merge with RRF, return top-N enriched chunks.

    This is the core retrieval step of the RAG pipeline. Better retrieval =
    better context = better answers. Hybrid search consistently outperforms
    either method alone, especially for technical queries mixing concepts
    (semantic) and exact identifiers (keyword).
    """
    semantic_results = semantic_search(query, source_id)
    keyword_results = keyword_search(query, source_id)

    # Build a lookup map so we can enrich merged IDs with full chunk data
    chunk_map: dict[str, dict] = {}
    for r in semantic_results + keyword_results:
        chunk_map[r["id"]] = r

    semantic_ids = [r["id"] for r in semantic_results]
    keyword_ids = [r["id"] for r in keyword_results]

    merged_ids = reciprocal_rank_fusion([semantic_ids, keyword_ids])

    return [chunk_map[cid] for cid in merged_ids[:TOP_N] if cid in chunk_map]
