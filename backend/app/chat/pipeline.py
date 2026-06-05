import json
from openai import OpenAI
from app.config import settings
from app.retrieval.hybrid import hybrid_search

_client: OpenAI | None = None

SYSTEM_PROMPT = """You are RepoLens, an expert assistant that answers questions about
code repositories and API documentation. Answer based ONLY on the provided context.
If the context doesn't contain enough information, say so clearly — do not guess.
Always reference which file or section your answer comes from."""


def get_openai() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=settings.openai_api_key)
    return _client


def _format_context(chunks: list[dict]) -> str:
    """
    Format retrieved chunks into a numbered context block for the GPT-4o prompt.

    WHY numbered labels: GPT-4o needs to know where each piece of context came from
    so it can cite sources in its answer. The [1], [2] labels map to the citations
    we send back to the frontend after streaming.
    """
    parts = []
    for i, chunk in enumerate(chunks):
        meta = chunk["metadata"]
        if meta.get("source") == "github":
            label = f"[{i+1}] File: {meta.get('file_path')} (lines {meta.get('start_line')}–{meta.get('end_line')})"
        else:
            label = f"[{i+1}] Page: {meta.get('page_url')} — {meta.get('section_title', '')}"
        parts.append(f"{label}\n{chunk['text']}")
    return "\n\n---\n\n".join(parts)


def stream_chat(question: str, source_id: str):
    """
    Generator that yields SSE-formatted strings for a chat response.

    Flow:
    1. Retrieve relevant chunks via hybrid search
    2. Format them into a context prompt
    3. Call GPT-4o with streaming=True
    4. Yield each token as a 'data: ...' SSE line
    5. Yield citations as a final event before 'done'

    WHY a generator: FastAPI's StreamingResponse consumes a generator lazily,
    sending each yielded string to the client immediately. This is what makes
    the response appear token-by-token in the browser.
    """
    chunks = hybrid_search(question, source_id)

    if not chunks:
        yield f"data: {json.dumps({'type': 'token', 'content': 'No relevant context found for your question.'})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
        return

    context = _format_context(chunks)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"},
    ]

    client = get_openai()
    stream = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        stream=True,
        temperature=0.1,  # low temperature = more factual, less creative/hallucinated
    )

    for event in stream:
        delta = event.choices[0].delta
        if delta.content:
            yield f"data: {json.dumps({'type': 'token', 'content': delta.content})}\n\n"

    # After all tokens, send source citations so the frontend can display them
    citations = []
    for i, chunk in enumerate(chunks):
        meta = chunk["metadata"]
        if meta.get("source") == "github":
            citations.append({
                "index": i + 1,
                "file_path": meta.get("file_path"),
                "start_line": meta.get("start_line"),
                "end_line": meta.get("end_line"),
                "repo_url": meta.get("repo_url"),
            })
        else:
            citations.append({
                "index": i + 1,
                "page_url": meta.get("page_url"),
                "section_title": meta.get("section_title"),
            })

    yield f"data: {json.dumps({'type': 'citations', 'citations': citations})}\n\n"
    yield f"data: {json.dumps({'type': 'done'})}\n\n"
