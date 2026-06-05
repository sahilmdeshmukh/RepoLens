import json
import re
import uuid
from datetime import datetime, timezone
from openai import OpenAI
from app.config import settings
from app.retrieval.hybrid import hybrid_search
from app.chat.pipeline import stream_chat
from app.db.sqlite import insert_eval_result

_client: OpenAI | None = None

JUDGE_PROMPT = """You are evaluating a RAG system's answer quality. Score the answer on two dimensions:

FAITHFULNESS (1-5): Is the answer grounded in the provided context? Does it avoid hallucination?
- 5: Every claim is directly supported by the context
- 3: Mostly supported, minor unsupported details
- 1: Answer contradicts or ignores the context

RELEVANCE (1-5): Does the answer actually address the question?
- 5: Directly and completely answers the question
- 3: Partially answers, misses some aspects
- 1: Does not answer the question

Question: {question}
Expected Answer: {expected_answer}
Generated Answer: {generated_answer}
Retrieved Context: {context}

Respond in exactly this format:
FAITHFULNESS: <score>
RELEVANCE: <score>
REASONING: <one sentence explanation>"""


def get_openai() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=settings.openai_api_key)
    return _client


def token_overlap_f1(text1: str, text2: str) -> float:
    """
    Compute F1 score of token overlap between two strings.

    WHY F1 and not just checking if answer keywords appear: F1 balances both
    precision (retrieved content is relevant) and recall (we got all the important
    content). A high recall but low precision means we retrieved everything but
    also lots of noise. F1 penalizes both extremes.
    """
    tokens1 = set(text1.lower().split())
    tokens2 = set(text2.lower().split())
    if not tokens1 or not tokens2:
        return 0.0
    intersection = tokens1 & tokens2
    precision = len(intersection) / len(tokens1)
    recall = len(intersection) / len(tokens2)
    if precision + recall == 0:
        return 0.0
    return 2 * precision * recall / (precision + recall)


def parse_judge_response(response: str) -> dict:
    """Extract structured scores from the LLM judge's text response."""
    faith_match = re.search(r"FAITHFULNESS:\s*(\d+)", response)
    rel_match = re.search(r"RELEVANCE:\s*(\d+)", response)
    reason_match = re.search(r"REASONING:\s*(.+)", response)
    return {
        "faithfulness": float(faith_match.group(1)) if faith_match else None,
        "relevance": float(rel_match.group(1)) if rel_match else None,
        "reasoning": reason_match.group(1).strip() if reason_match else "",
    }


def _generate_answer(question: str, source_id: str) -> str:
    """Run the full chat pipeline and collect all streamed tokens into one string."""
    tokens = []
    for event_str in stream_chat(question, source_id):
        if not event_str.startswith("data: "):
            continue
        payload = json.loads(event_str[6:])
        if payload.get("type") == "token":
            tokens.append(payload["content"])
    return "".join(tokens)


def run_evals(source_id: str, dataset_path: str) -> dict:
    """
    Run the full eval suite against a test dataset and store results in SQLite.

    For each question:
    1. Run hybrid search to get retrieved chunks
    2. Compute token overlap F1 between expected answer and retrieved text
    3. Generate an answer using the full chat pipeline
    4. Ask GPT-4o to judge faithfulness and relevance

    WHY LLM-as-judge: human evaluation is the gold standard but doesn't scale.
    GPT-4o as a judge correlates well with human ratings and runs automatically.
    The key is giving it a clear rubric (our JUDGE_PROMPT) so scores are consistent.
    """
    with open(dataset_path) as f:
        dataset = json.load(f)

    client = get_openai()
    run_at = datetime.now(timezone.utc).isoformat()
    results = []

    for item in dataset:
        question = item["question"]
        expected_answer = item["expected_answer"]

        # Step 1: Retrieval eval
        retrieved_chunks = hybrid_search(question, source_id)
        retrieved_text = " ".join(c["text"] for c in retrieved_chunks)
        f1 = token_overlap_f1(expected_answer, retrieved_text)

        # Step 2: Generate answer through full pipeline
        generated_answer = _generate_answer(question, source_id)

        # Step 3: LLM-as-judge
        judge_input = JUDGE_PROMPT.format(
            question=question,
            expected_answer=expected_answer,
            generated_answer=generated_answer,
            context=retrieved_text[:2000],
        )
        judge_resp = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": judge_input}],
            temperature=0,  # deterministic scoring
        )
        scores = parse_judge_response(judge_resp.choices[0].message.content)

        result = {
            "id": str(uuid.uuid4()),
            "source_id": source_id,
            "run_at": run_at,
            "question": question,
            "generated_answer": generated_answer,
            "expected_answer": expected_answer,
            "retrieved_texts": json.dumps([c["text"][:200] for c in retrieved_chunks]),
            "token_overlap_f1": f1,
            "faithfulness": scores["faithfulness"],
            "relevance": scores["relevance"],
            "judge_reasoning": scores["reasoning"],
        }
        insert_eval_result(result)
        results.append(result)

    avg_f1 = sum(r["token_overlap_f1"] for r in results) / len(results) if results else 0
    avg_faith = sum(r["faithfulness"] or 0 for r in results) / len(results) if results else 0
    avg_rel = sum(r["relevance"] or 0 for r in results) / len(results) if results else 0

    return {
        "total_questions": len(results),
        "avg_token_overlap_f1": round(avg_f1, 3),
        "avg_faithfulness": round(avg_faith, 2),
        "avg_relevance": round(avg_rel, 2),
        "run_at": run_at,
    }
