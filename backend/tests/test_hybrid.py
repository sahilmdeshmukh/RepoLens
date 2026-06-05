from app.retrieval.hybrid import reciprocal_rank_fusion


def test_rrf_combines_two_ranked_lists():
    semantic = ["chunk_a", "chunk_b", "chunk_c"]
    keyword  = ["chunk_b", "chunk_d", "chunk_a"]
    result = reciprocal_rank_fusion([semantic, keyword])
    # chunk_b: ranked 2nd in semantic + 1st in keyword → high score
    # chunk_a: ranked 1st in semantic + 3rd in keyword → also high
    assert result[0] in ("chunk_a", "chunk_b")
    assert "chunk_d" in result


def test_rrf_single_list_preserves_order():
    ranked = ["x", "y", "z"]
    result = reciprocal_rank_fusion([ranked])
    assert result == ["x", "y", "z"]


def test_rrf_deduplicates():
    list1 = ["a", "b"]
    list2 = ["a", "c"]
    result = reciprocal_rank_fusion([list1, list2])
    assert result.count("a") == 1
