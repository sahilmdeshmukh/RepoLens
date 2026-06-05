from app.evals.runner import token_overlap_f1, parse_judge_response


def test_token_overlap_f1_identical():
    assert token_overlap_f1("the quick brown fox", "the quick brown fox") == 1.0


def test_token_overlap_f1_no_overlap():
    assert token_overlap_f1("hello world", "foo bar baz") == 0.0


def test_token_overlap_f1_partial():
    f1 = token_overlap_f1("authentication uses JWT tokens", "JWT tokens are used")
    assert 0.0 < f1 < 1.0


def test_parse_judge_response_valid():
    response = "FAITHFULNESS: 4\nRELEVANCE: 5\nREASONING: The answer is well grounded."
    result = parse_judge_response(response)
    assert result["faithfulness"] == 4.0
    assert result["relevance"] == 5.0
    assert "grounded" in result["reasoning"]


def test_parse_judge_response_missing_fields():
    result = parse_judge_response("something unexpected")
    assert result["faithfulness"] is None
    assert result["relevance"] is None
