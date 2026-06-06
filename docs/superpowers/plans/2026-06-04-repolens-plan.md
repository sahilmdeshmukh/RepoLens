# RepoLens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy RepoLens — a RAG chat app that indexes GitHub repos and API docs, answers questions with hybrid search + GPT-4o, streams responses with source citations, and measures quality via retrieval + LLM-as-judge evals.

**Architecture:** Source-aware ingestion stores AST-chunked code and section-chunked docs in Qdrant with rich metadata and chunk text in SQLite. Queries use hybrid search (semantic via Qdrant + keyword via BM25, merged with RRF) to fetch top-K chunks assembled into a GPT-4o prompt streamed back via SSE. Evals run a JSON test dataset through the full pipeline scoring Precision@K and LLM-as-judge faithfulness/relevance.

**Tech Stack:** FastAPI, SQLite, Qdrant Cloud, OpenAI (text-embedding-3-small + GPT-4o), tree-sitter, rank-bm25, crawl4ai, httpx, React + TypeScript, Tailwind CSS, shadcn/ui, react-query, Render, Vercel

---

## File Structure

```
RepoLens/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI app, CORS, router mounts
│   │   ├── config.py               # Settings via pydantic-settings
│   │   ├── db/
│   │   │   ├── __init__.py
│   │   │   ├── sqlite.py           # Connection, table creation, helpers
│   │   │   └── qdrant.py           # Qdrant client singleton + collection setup
│   │   ├── ingestion/
│   │   │   ├── __init__.py
│   │   │   ├── router.py           # POST /ingest, GET /sources, GET /sources/{id}
│   │   │   ├── github.py           # GitHub API fetch + chunk + embed pipeline
│   │   │   ├── api_docs.py         # crawl4ai crawl + chunk + embed pipeline
│   │   │   ├── chunker.py          # tree-sitter (code) + heading splitter (docs)
│   │   │   └── embedder.py         # OpenAI text-embedding-3-small, batched
│   │   ├── retrieval/
│   │   │   ├── __init__.py
│   │   │   ├── semantic.py         # Qdrant vector search
│   │   │   ├── keyword.py          # BM25 over SQLite chunks
│   │   │   └── hybrid.py           # RRF merge of semantic + keyword results
│   │   ├── chat/
│   │   │   ├── __init__.py
│   │   │   ├── router.py           # POST /chat → SSE StreamingResponse
│   │   │   └── pipeline.py         # Prompt assembly + GPT-4o streaming
│   │   └── evals/
│   │       ├── __init__.py
│   │       ├── router.py           # POST /evals/run, GET /evals/results/{source_id}
│   │       └── runner.py           # Retrieval metrics + LLM-as-judge
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_chunker.py
│   │   ├── test_hybrid.py
│   │   └── test_eval_runner.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── types.ts
│   │   ├── lib/api.ts
│   │   ├── components/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Chat.tsx
│   │   │   ├── Message.tsx
│   │   │   └── EvalsTab.tsx
│   │   └── hooks/
│   │       ├── useIngest.ts
│   │       ├── useSources.ts
│   │       └── useEvals.ts
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.ts
│   └── vite.config.ts
├── evals/
│   └── datasets/
│       ├── github_qa.json
│       └── api_docs_qa.json
└── docs/
    └── superpowers/
        ├── specs/2026-06-04-repolens-design.md
        └── plans/2026-06-04-repolens-plan.md
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/.env.example`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Create folder structure**

```bash
mkdir -p backend/app/db backend/app/ingestion backend/app/retrieval backend/app/chat backend/app/evals backend/tests
mkdir -p frontend evals/datasets docs/superpowers/plans
touch backend/app/__init__.py backend/app/db/__init__.py
touch backend/app/ingestion/__init__.py backend/app/retrieval/__init__.py
touch backend/app/chat/__init__.py backend/app/evals/__init__.py
touch backend/tests/__init__.py
```

- [ ] **Step 2: Write `backend/requirements.txt`**

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
pydantic-settings==2.3.4
httpx==0.27.2
gitpython==3.1.43
tree-sitter==0.23.2
tree-sitter-python==0.23.2
tree-sitter-javascript==0.23.1
tree-sitter-typescript==0.23.2
tree-sitter-go==0.23.1
rank-bm25==0.2.2
crawl4ai==0.3.74
qdrant-client==1.11.3
openai==1.51.2
python-dotenv==1.0.1
pytest==8.3.3
pytest-asyncio==0.24.0
```

- [ ] **Step 3: Write `backend/.env.example`**

```
OPENAI_API_KEY=sk-...
QDRANT_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your-qdrant-api-key
GITHUB_TOKEN=ghp_...
```

> **Why GITHUB_TOKEN?** GitHub's public API allows 60 requests/hour unauthenticated. A personal access token raises this to 5000/hour. We need it because indexing a repo may require fetching hundreds of files.

- [ ] **Step 4: Write `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="RepoLens API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}
```

> **Why CORS with allow_origins=["*"]?** During development the React frontend runs on a different port than FastAPI. CORS headers tell the browser it's safe to make cross-origin requests. For a portfolio project `"*"` is fine; production systems restrict to specific domains.

- [ ] **Step 5: Write `backend/tests/conftest.py`**

```python
import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def client():
    return TestClient(app)
```

- [ ] **Step 6: Write `.gitignore`**

```
# Python
__pycache__/
*.py[cod]
.venv/
*.egg-info/
.env

# Node
node_modules/
dist/
.env.local

# DB
*.db
*.sqlite

# Misc
.DS_Store
```

- [ ] **Step 7: Write `README.md`**

```markdown
# RepoLens

A RAG-powered chat app that indexes GitHub repos and API docs, enabling natural
language Q&A with hybrid search, streaming responses, source citations, and
built-in retrieval + answer quality evals.

## Stack
- **Backend:** FastAPI, Qdrant, SQLite, OpenAI
- **Frontend:** React + TypeScript, Tailwind CSS, shadcn/ui
- **Deploy:** Render (backend), Vercel (frontend), Qdrant Cloud

## Setup

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env       # fill in your keys
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```
```

- [ ] **Step 8: Install dependencies and verify the app starts**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Expected: `Uvicorn running on http://127.0.0.1:8000`. Visit `http://127.0.0.1:8000/health` → `{"status": "ok"}`

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "feat: project scaffold with FastAPI skeleton"
```

---

## Task 2: Config Module

**Why this exists:** Hardcoding API keys in code is a security risk. `pydantic-settings` reads from environment variables (or a `.env` file) and validates them at startup — the app crashes immediately with a clear error if a key is missing, rather than failing silently at runtime.

**Files:**
- Create: `backend/app/config.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write `backend/app/config.py`**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    openai_api_key: str
    qdrant_url: str
    qdrant_api_key: str
    github_token: str = ""  # optional — falls back to unauthenticated

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
```

- [ ] **Step 2: Update `backend/app/main.py` to import settings on startup**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings  # validates env vars at import time

app = FastAPI(title="RepoLens API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 3: Verify startup fails clearly when a key is missing**

Temporarily remove `OPENAI_API_KEY` from `.env`, run `uvicorn app.main:app --reload`.
Expected: `ValidationError` listing the missing field.
Restore `.env`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/config.py backend/app/main.py
git commit -m "feat: add pydantic-settings config with env validation"
```

---

## Task 3: SQLite Layer

**Why SQLite?** We need to track ingestion job status, store chunk texts for BM25 search, and persist eval results — all relational data. SQLite requires zero infrastructure (no separate DB server) and is built into Python. For a portfolio project it's the right tool.

**Schema:**
- `sources` — one row per indexed URL (GitHub repo or API docs site)
- `chunks` — one row per text chunk, linked to a source, stores raw text for BM25
- `eval_results` — one row per eval question per run

**Files:**
- Create: `backend/app/db/sqlite.py`

- [ ] **Step 1: Write `backend/app/db/sqlite.py`**

```python
import sqlite3
import json
from pathlib import Path

DB_PATH = Path("repolens.db")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # rows behave like dicts
    return conn


def init_db():
    with get_connection() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS sources (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                source_type TEXT NOT NULL,
                name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                chunk_count INTEGER DEFAULT 0,
                error TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS chunks (
                id TEXT PRIMARY KEY,
                source_id TEXT NOT NULL,
                text TEXT NOT NULL,
                metadata TEXT NOT NULL,
                FOREIGN KEY (source_id) REFERENCES sources(id)
            );

            CREATE TABLE IF NOT EXISTS eval_results (
                id TEXT PRIMARY KEY,
                source_id TEXT NOT NULL,
                run_at TEXT NOT NULL,
                question TEXT NOT NULL,
                generated_answer TEXT,
                expected_answer TEXT NOT NULL,
                retrieved_texts TEXT NOT NULL,
                token_overlap_f1 REAL,
                faithfulness REAL,
                relevance REAL,
                judge_reasoning TEXT
            );
        """)


def insert_source(source: dict):
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO sources (id, url, source_type, name, status, created_at)
               VALUES (:id, :url, :source_type, :name, :status, :created_at)""",
            source,
        )


def update_source_status(source_id: str, status: str, chunk_count: int = 0, error: str = None):
    with get_connection() as conn:
        conn.execute(
            "UPDATE sources SET status=?, chunk_count=?, error=? WHERE id=?",
            (status, chunk_count, error, source_id),
        )


def insert_chunk(chunk: dict):
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO chunks (id, source_id, text, metadata) VALUES (?, ?, ?, ?)",
            (chunk["id"], chunk["source_id"], chunk["text"], json.dumps(chunk["metadata"])),
        )


def get_chunks_for_source(source_id: str) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, text, metadata FROM chunks WHERE source_id=?", (source_id,)
        ).fetchall()
    return [{"id": r["id"], "text": r["text"], "metadata": json.loads(r["metadata"])} for r in rows]


def get_all_sources() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM sources ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def get_source(source_id: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM sources WHERE id=?", (source_id,)).fetchone()
    return dict(row) if row else None


def insert_eval_result(result: dict):
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO eval_results
               (id, source_id, run_at, question, generated_answer, expected_answer,
                retrieved_texts, token_overlap_f1, faithfulness, relevance, judge_reasoning)
               VALUES (:id, :source_id, :run_at, :question, :generated_answer,
                       :expected_answer, :retrieved_texts, :token_overlap_f1,
                       :faithfulness, :relevance, :judge_reasoning)""",
            result,
        )


def get_eval_results(source_id: str) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM eval_results WHERE source_id=? ORDER BY run_at DESC",
            (source_id,),
        ).fetchall()
    return [dict(r) for r in rows]
```

- [ ] **Step 2: Call `init_db()` on app startup in `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db.sqlite import init_db

app = FastAPI(title="RepoLens API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    init_db()

@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 3: Verify tables are created**

```bash
uvicorn app.main:app --reload
# In another terminal:
python -c "import sqlite3; c = sqlite3.connect('repolens.db'); print([r[0] for r in c.execute(\"SELECT name FROM sqlite_master WHERE type='table'\")])"
```

Expected: `['sources', 'chunks', 'eval_results']`

- [ ] **Step 4: Commit**

```bash
git add backend/app/db/sqlite.py backend/app/main.py
git commit -m "feat: SQLite layer with sources, chunks, eval_results tables"
```

---

## Task 4: Qdrant Client Setup

**Why Qdrant?** Qdrant is a purpose-built vector database. It stores embeddings (arrays of floats) and lets you search by cosine similarity — finding chunks that are semantically close to your query. Unlike storing vectors in SQLite or Postgres, Qdrant is optimized for this operation (uses HNSW indexing for fast approximate nearest neighbor search).

**Files:**
- Create: `backend/app/db/qdrant.py`

- [ ] **Step 1: Sign up for Qdrant Cloud**

Go to https://cloud.qdrant.io → Create a free cluster → Copy the cluster URL and API key → Add to `.env`:
```
QDRANT_URL=https://your-cluster-id.us-east4-0.gcp.cloud.qdrant.io
QDRANT_API_KEY=your-api-key-here
```

- [ ] **Step 2: Write `backend/app/db/qdrant.py`**

```python
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams
from app.config import settings

COLLECTION_NAME = "repolens_chunks"
EMBEDDING_DIM = 1536  # text-embedding-3-small produces 1536-dimensional vectors

_client: QdrantClient | None = None


def get_qdrant() -> QdrantClient:
    global _client
    if _client is None:
        _client = QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key)
    return _client


def ensure_collection():
    client = get_qdrant()
    existing = [c.name for c in client.get_collections().collections]
    if COLLECTION_NAME not in existing:
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
        )
```

> **Why COSINE distance?** Text embeddings are unit-normalized vectors. Cosine similarity measures the angle between two vectors — a score of 1 means identical meaning, 0 means unrelated. It's the standard metric for semantic text search.

- [ ] **Step 3: Call `ensure_collection()` on startup in `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db.sqlite import init_db
from app.db.qdrant import ensure_collection

app = FastAPI(title="RepoLens API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    init_db()
    ensure_collection()

@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 4: Verify connection**

```bash
python -c "
from app.config import settings
from app.db.qdrant import get_qdrant, ensure_collection
ensure_collection()
client = get_qdrant()
print(client.get_collections())
"
```

Expected: collections list including `repolens_chunks`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/db/qdrant.py backend/app/main.py
git commit -m "feat: Qdrant client with collection auto-creation"
```

---

## Task 5: Chunker Module

**Why chunking matters:** LLMs have a context window limit — you can't feed an entire codebase into a prompt. Chunking splits content into small pieces so you can retrieve only the relevant ones. The *strategy* matters enormously: naive fixed-size splitting cuts functions in half, breaking meaning. We use AST-aware splitting for code (respects function/class boundaries) and heading-based splitting for docs.

**Files:**
- Create: `backend/app/ingestion/chunker.py`
- Create: `backend/tests/test_chunker.py`

- [ ] **Step 1: Write the failing tests in `backend/tests/test_chunker.py`**

```python
from app.ingestion.chunker import chunk_code, chunk_markdown, chunk_html


def test_chunk_python_splits_by_function():
    source = """
def add(a, b):
    return a + b

def multiply(a, b):
    return a * b
"""
    chunks = chunk_code(source, language="python")
    assert len(chunks) == 2
    assert "def add" in chunks[0]["text"]
    assert "def multiply" in chunks[1]["text"]
    assert chunks[0]["chunk_type"] == "function"


def test_chunk_python_class():
    source = """
class Calculator:
    def add(self, a, b):
        return a + b
"""
    chunks = chunk_code(source, language="python")
    assert len(chunks) == 1
    assert chunks[0]["chunk_type"] == "class"


def test_chunk_markdown_splits_by_heading():
    md = """# Title

Intro text.

## Section One

Content one.

## Section Two

Content two.
"""
    chunks = chunk_markdown(md)
    assert len(chunks) == 3
    assert "Intro text" in chunks[0]["text"]
    assert "Section One" in chunks[1]["text"]
    assert "Section Two" in chunks[2]["text"]


def test_chunk_unsupported_language_falls_back_to_lines():
    source = "\n".join([f"line {i}" for i in range(200)])
    chunks = chunk_code(source, language="ruby")
    assert len(chunks) > 1
    for chunk in chunks:
        assert len(chunk["text"]) <= 3000


def test_chunk_html_splits_by_heading():
    html = """
<h1>API Reference</h1>
<p>Overview text.</p>
<h2>Endpoints</h2>
<p>List of endpoints.</p>
<h2>Authentication</h2>
<p>Auth details.</p>
"""
    chunks = chunk_html(html)
    assert len(chunks) == 3
    assert "Overview" in chunks[0]["text"]
    assert "Endpoints" in chunks[1]["text"]
    assert "Authentication" in chunks[2]["text"]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
pytest tests/test_chunker.py -v
```

Expected: `ImportError` or `ModuleNotFoundError` — the chunker doesn't exist yet.

- [ ] **Step 3: Write `backend/app/ingestion/chunker.py`**

```python
import re
from typing import Literal
from tree_sitter import Language, Parser
import tree_sitter_python as tspython
import tree_sitter_javascript as tsjavascript
import tree_sitter_typescript as tstypescript
import tree_sitter_go as tsgo
from bs4 import BeautifulSoup

# Build language objects once at module load (not per-call — parsing is expensive)
_LANGUAGES: dict[str, Language] = {
    "python": Language(tspython.language()),
    "javascript": Language(tsjavascript.language()),
    "typescript": Language(tstypescript.language_typescript()),
    "tsx": Language(tstypescript.language_tsx()),
    "go": Language(tsgo.language()),
}

# tree-sitter query strings per language to find function + class nodes
_QUERIES: dict[str, str] = {
    "python": "(function_definition) @function (class_definition) @class",
    "javascript": "(function_declaration) @function (class_declaration) @class (method_definition) @function",
    "typescript": "(function_declaration) @function (class_declaration) @class (method_definition) @function",
    "tsx": "(function_declaration) @function (class_declaration) @class (method_definition) @function",
    "go": "(function_declaration) @function (method_declaration) @function",
}

MAX_CHUNK_CHARS = 2000  # keep chunks under ~500 tokens to leave room in the prompt


def chunk_code(source: str, language: str) -> list[dict]:
    """
    Split source code into chunks by function/class boundaries using tree-sitter AST parsing.
    Falls back to line-based chunking for unsupported languages.

    WHY tree-sitter: it parses source code into a syntax tree, letting us find
    exact start/end byte positions of functions and classes. This preserves complete,
    meaningful code units rather than cutting mid-function.
    """
    lang = _LANGUAGES.get(language)
    if lang is None:
        return _fallback_line_chunks(source)

    parser = Parser(lang)
    tree = parser.parse(bytes(source, "utf8"))
    query_str = _QUERIES.get(language, "")
    if not query_str:
        return _fallback_line_chunks(source)

    query = lang.query(query_str)
    captures = query.captures(tree.root_node)

    chunks = []
    seen_ranges = set()
    for node, capture_name in captures:
        key = (node.start_byte, node.end_byte)
        if key in seen_ranges:
            continue
        seen_ranges.add(key)
        text = source[node.start_byte:node.end_byte]
        if len(text) > MAX_CHUNK_CHARS:
            text = text[:MAX_CHUNK_CHARS]
        chunks.append({
            "text": text,
            "start_line": node.start_point[0] + 1,
            "end_line": node.end_point[0] + 1,
            "chunk_type": capture_name,  # "function" or "class"
        })

    return chunks if chunks else _fallback_line_chunks(source)


def _fallback_line_chunks(source: str) -> list[dict]:
    """Chunk by line windows when AST parsing isn't available."""
    lines = source.splitlines()
    chunks = []
    window = 60  # ~60 lines per chunk
    for i in range(0, len(lines), window):
        text = "\n".join(lines[i:i + window])
        chunks.append({
            "text": text,
            "start_line": i + 1,
            "end_line": min(i + window, len(lines)),
            "chunk_type": "lines",
        })
    return chunks


def chunk_markdown(text: str) -> list[dict]:
    """
    Split markdown by heading sections (##, ###).
    Each heading + its content becomes one chunk.

    WHY heading-based: README and doc pages are organized by headings.
    Splitting there preserves complete topic sections.
    """
    pattern = re.compile(r"(?=^#{1,3} )", re.MULTILINE)
    sections = pattern.split(text)
    chunks = []
    for section in sections:
        section = section.strip()
        if not section:
            continue
        if len(section) > MAX_CHUNK_CHARS:
            section = section[:MAX_CHUNK_CHARS]
        chunks.append({"text": section, "chunk_type": "section"})
    return chunks


def chunk_html(html: str) -> list[dict]:
    """
    Split HTML docs by h1/h2/h3 heading sections.
    Strips tags, keeps plain text per section.

    WHY BeautifulSoup: API docs are often JS-rendered HTML. We extract
    the visible text organized by headings, discarding nav/footer noise.
    """
    soup = BeautifulSoup(html, "html.parser")
    headings = soup.find_all(["h1", "h2", "h3"])
    chunks = []

    for i, heading in enumerate(headings):
        # Collect text from this heading until the next one
        section_text = heading.get_text(separator=" ", strip=True) + "\n"
        for sibling in heading.find_next_siblings():
            if sibling.name in ["h1", "h2", "h3"]:
                break
            section_text += sibling.get_text(separator=" ", strip=True) + "\n"
        section_text = section_text.strip()
        if not section_text:
            continue
        if len(section_text) > MAX_CHUNK_CHARS:
            section_text = section_text[:MAX_CHUNK_CHARS]
        chunks.append({"text": section_text, "chunk_type": "section"})

    return chunks
```

> **Note:** `BeautifulSoup` requires the `beautifulsoup4` package. Add `beautifulsoup4==4.12.3` to `requirements.txt` and run `pip install beautifulsoup4`.

- [ ] **Step 4: Add `beautifulsoup4` to `requirements.txt` and install**

```
beautifulsoup4==4.12.3
```

```bash
pip install beautifulsoup4
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/test_chunker.py -v
```

Expected: all 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/ingestion/chunker.py backend/tests/test_chunker.py backend/requirements.txt
git commit -m "feat: AST-aware code chunker with tree-sitter + markdown/HTML section splitter"
```

---

## Task 6: Embedder Module

**Why embeddings?** An embedding is a dense vector (array of floats) that represents the *meaning* of a piece of text. Texts with similar meanings have vectors that point in similar directions. `text-embedding-3-small` maps any text to a 1536-dimensional vector. We embed both chunks (at index time) and queries (at search time) and find the closest chunks by cosine similarity.

**Files:**
- Create: `backend/app/ingestion/embedder.py`

- [ ] **Step 1: Write `backend/app/ingestion/embedder.py`**

```python
from openai import OpenAI
from app.config import settings

_client: OpenAI | None = None

EMBEDDING_MODEL = "text-embedding-3-small"
BATCH_SIZE = 100  # OpenAI allows up to 2048 inputs per request; 100 is safe


def get_openai() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=settings.openai_api_key)
    return _client


def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Embed a list of texts in batches.

    WHY batching: the OpenAI API allows embedding multiple texts in one HTTP
    request. Batching reduces round-trip latency and API call overhead —
    embedding 100 chunks in one call is ~100x faster than 100 individual calls.
    """
    client = get_openai()
    all_embeddings = []

    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i:i + BATCH_SIZE]
        response = client.embeddings.create(model=EMBEDDING_MODEL, input=batch)
        # response.data is a list of Embedding objects, sorted by index
        embeddings = [item.embedding for item in sorted(response.data, key=lambda x: x.index)]
        all_embeddings.extend(embeddings)

    return all_embeddings


def embed_query(text: str) -> list[float]:
    """Embed a single query string."""
    return embed_texts([text])[0]
```

- [ ] **Step 2: Quick smoke test (manual, uses real API)**

```bash
python -c "
from app.ingestion.embedder import embed_query
v = embed_query('how does authentication work?')
print(f'Embedding dim: {len(v)}, first 3 values: {v[:3]}')
"
```

Expected: `Embedding dim: 1536, first 3 values: [some floats]`

- [ ] **Step 3: Commit**

```bash
git add backend/app/ingestion/embedder.py
git commit -m "feat: OpenAI embedder with batching support"
```

---

## Task 7: GitHub Ingestion Pipeline

**How it works:** We call the GitHub Contents API to list all files in the repo, filter to code/markdown files, fetch each file's content (base64-encoded), decode it, chunk it with our chunker, embed the chunks, and store everything in Qdrant + SQLite.

**WHY GitHub API over git clone:** Cloning requires git to be installed on the server. The API works over HTTPS — simpler for deployment, no binary dependencies.

**Files:**
- Create: `backend/app/ingestion/github.py`

- [ ] **Step 1: Write `backend/app/ingestion/github.py`**

```python
import base64
import uuid
from pathlib import Path
import httpx
from app.config import settings
from app.ingestion.chunker import chunk_code, chunk_markdown
from app.ingestion.embedder import embed_texts
from app.db.sqlite import insert_chunk, update_source_status
from app.db.qdrant import get_qdrant, COLLECTION_NAME
from qdrant_client.models import PointStruct

# File extensions we support chunking
CODE_EXTENSIONS = {
    ".py": "python",
    ".js": "javascript",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".go": "go",
}
DOC_EXTENSIONS = {".md", ".mdx"}
SKIP_DIRS = {"node_modules", ".git", "__pycache__", "dist", "build", ".venv", "venv"}

MAX_FILE_SIZE_BYTES = 100_000  # skip files larger than 100KB


def _github_headers() -> dict:
    headers = {"Accept": "application/vnd.github+json"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"
    return headers


def _parse_repo_url(url: str) -> tuple[str, str]:
    """Extract owner and repo name from a GitHub URL."""
    # Handles: https://github.com/owner/repo or https://github.com/owner/repo.git
    parts = url.rstrip("/").rstrip(".git").split("/")
    return parts[-2], parts[-1]


def _list_repo_files(owner: str, repo: str) -> list[dict]:
    """
    Fetch the full recursive file tree from GitHub API.
    Returns a flat list of file objects with path and download URL.
    """
    url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/HEAD?recursive=1"
    resp = httpx.get(url, headers=_github_headers(), timeout=30)
    resp.raise_for_status()
    tree = resp.json().get("tree", [])
    return [f for f in tree if f["type"] == "blob"]


def _fetch_file_content(owner: str, repo: str, path: str) -> str | None:
    """Fetch a single file's content via GitHub API. Returns decoded text or None."""
    url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"
    resp = httpx.get(url, headers=_github_headers(), timeout=15)
    if resp.status_code != 200:
        return None
    data = resp.json()
    if data.get("size", 0) > MAX_FILE_SIZE_BYTES:
        return None
    content_b64 = data.get("content", "")
    return base64.b64decode(content_b64).decode("utf-8", errors="ignore")


def ingest_github_repo(source_id: str, repo_url: str):
    """
    Full pipeline: list files → fetch → chunk → embed → store.
    Called in a background task so it doesn't block the HTTP response.
    """
    try:
        update_source_status(source_id, "processing")
        owner, repo = _parse_repo_url(repo_url)
        files = _list_repo_files(owner, repo)

        all_chunks = []
        for file in files:
            path = file["path"]
            # Skip unwanted directories
            parts = Path(path).parts
            if any(d in SKIP_DIRS for d in parts):
                continue

            ext = Path(path).suffix.lower()
            language = CODE_EXTENSIONS.get(ext)
            is_doc = ext in DOC_EXTENSIONS

            if not language and not is_doc:
                continue

            content = _fetch_file_content(owner, repo, path)
            if not content:
                continue

            raw_chunks = chunk_code(content, language) if language else chunk_markdown(content)

            for raw in raw_chunks:
                chunk_id = str(uuid.uuid4())
                metadata = {
                    "source": "github",
                    "repo_url": repo_url,
                    "file_path": path,
                    "language": language or "markdown",
                    "start_line": raw.get("start_line"),
                    "end_line": raw.get("end_line"),
                    "chunk_type": raw["chunk_type"],
                }
                all_chunks.append({
                    "id": chunk_id,
                    "source_id": source_id,
                    "text": raw["text"],
                    "metadata": metadata,
                })

        if not all_chunks:
            update_source_status(source_id, "failed", error="No indexable files found")
            return

        # Embed all chunks in batches
        texts = [c["text"] for c in all_chunks]
        embeddings = embed_texts(texts)

        # Upsert into Qdrant
        qdrant = get_qdrant()
        points = [
            PointStruct(
                id=c["id"],
                vector=emb,
                payload={**c["metadata"], "source_id": source_id, "text": c["text"]},
            )
            for c, emb in zip(all_chunks, embeddings)
        ]
        qdrant.upsert(collection_name=COLLECTION_NAME, points=points)

        # Store chunk text in SQLite for BM25 search
        for chunk in all_chunks:
            insert_chunk(chunk)

        update_source_status(source_id, "complete", chunk_count=len(all_chunks))

    except Exception as e:
        update_source_status(source_id, "failed", error=str(e))
        raise
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/ingestion/github.py
git commit -m "feat: GitHub repo ingestion pipeline with AST chunking and Qdrant upsert"
```

---

## Task 8: API Docs Ingestion Pipeline

**How it works:** We use `crawl4ai` to crawl the docs site starting from the submitted URL, fetch all pages it can reach under the same domain, extract HTML content, chunk by headings, embed, and store. `crawl4ai` handles JS-rendered pages (common for modern API docs like Stripe, OpenAI, etc.) by running a headless browser via Playwright.

**Files:**
- Create: `backend/app/ingestion/api_docs.py`

- [ ] **Step 1: Install Playwright browsers for crawl4ai (one-time setup)**

```bash
crawl4ai-setup
```

Expected: downloads Chromium browser binaries.

- [ ] **Step 2: Write `backend/app/ingestion/api_docs.py`**

```python
import uuid
import asyncio
from urllib.parse import urlparse
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
from app.ingestion.chunker import chunk_html, chunk_markdown
from app.ingestion.embedder import embed_texts
from app.db.sqlite import insert_chunk, update_source_status
from app.db.qdrant import get_qdrant, COLLECTION_NAME
from qdrant_client.models import PointStruct

MAX_PAGES = 50  # cap to avoid runaway crawls on large doc sites


async def _crawl_site(base_url: str) -> list[dict]:
    """
    Crawl all pages under the same domain as base_url.
    Returns list of {url, html} dicts.
    """
    parsed = urlparse(base_url)
    domain = f"{parsed.scheme}://{parsed.netloc}"

    browser_config = BrowserConfig(headless=True)
    run_config = CrawlerRunConfig(cache_mode=CacheMode.BYPASS)

    pages = []
    visited = set()
    queue = [base_url]

    async with AsyncWebCrawler(config=browser_config) as crawler:
        while queue and len(visited) < MAX_PAGES:
            url = queue.pop(0)
            if url in visited:
                continue
            visited.add(url)

            result = await crawler.arun(url=url, config=run_config)
            if not result.success:
                continue

            pages.append({"url": url, "html": result.html})

            # Queue internal links we haven't visited yet
            for link in (result.links or {}).get("internal", []):
                href = link.get("href", "")
                if href.startswith(domain) and href not in visited:
                    queue.append(href)

    return pages


def ingest_api_docs(source_id: str, docs_url: str):
    """
    Full pipeline: crawl site → chunk HTML → embed → store.
    Runs the async crawl in a new event loop (called from BackgroundTasks thread).
    """
    try:
        update_source_status(source_id, "processing")

        # crawl4ai is async; BackgroundTasks runs in a thread pool, so we create a new event loop
        pages = asyncio.run(_crawl_site(docs_url))

        all_chunks = []
        for page in pages:
            raw_chunks = chunk_html(page["html"])
            for raw in raw_chunks:
                chunk_id = str(uuid.uuid4())
                metadata = {
                    "source": "api_docs",
                    "base_url": docs_url,
                    "page_url": page["url"],
                    "section_title": raw["text"].split("\n")[0][:100],
                    "chunk_type": raw["chunk_type"],
                }
                all_chunks.append({
                    "id": chunk_id,
                    "source_id": source_id,
                    "text": raw["text"],
                    "metadata": metadata,
                })

        if not all_chunks:
            update_source_status(source_id, "failed", error="No content extracted from docs")
            return

        texts = [c["text"] for c in all_chunks]
        embeddings = embed_texts(texts)

        qdrant = get_qdrant()
        points = [
            PointStruct(
                id=c["id"],
                vector=emb,
                payload={**c["metadata"], "source_id": source_id, "text": c["text"]},
            )
            for c, emb in zip(all_chunks, embeddings)
        ]
        qdrant.upsert(collection_name=COLLECTION_NAME, points=points)

        for chunk in all_chunks:
            insert_chunk(chunk)

        update_source_status(source_id, "complete", chunk_count=len(all_chunks))

    except Exception as e:
        update_source_status(source_id, "failed", error=str(e))
        raise
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/ingestion/api_docs.py
git commit -m "feat: API docs ingestion with crawl4ai crawling and HTML section chunking"
```

---

## Task 9: Ingestion Router

**Files:**
- Create: `backend/app/ingestion/router.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write `backend/app/ingestion/router.py`**

```python
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from app.db.sqlite import insert_source, get_all_sources, get_source
from app.ingestion.github import ingest_github_repo
from app.ingestion.api_docs import ingest_api_docs

router = APIRouter(prefix="/ingest", tags=["ingestion"])


class IngestRequest(BaseModel):
    url: str
    source_type: str  # "github" or "api_docs"


@router.post("")
async def start_ingestion(req: IngestRequest, background_tasks: BackgroundTasks):
    """
    Start indexing a GitHub repo or API docs site.
    Returns immediately with a source_id — the actual work runs in the background.

    WHY BackgroundTasks: indexing can take minutes (fetching 100s of files,
    calling OpenAI for embeddings). We don't want the HTTP request to hang.
    The client polls GET /sources/{id} to check progress.
    """
    source_id = str(uuid.uuid4())
    name = req.url.rstrip("/").split("/")[-1] if req.source_type == "github" else req.url

    insert_source({
        "id": source_id,
        "url": req.url,
        "source_type": req.source_type,
        "name": name,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    if req.source_type == "github":
        background_tasks.add_task(ingest_github_repo, source_id, req.url)
    elif req.source_type == "api_docs":
        background_tasks.add_task(ingest_api_docs, source_id, req.url)
    else:
        raise HTTPException(status_code=400, detail="source_type must be 'github' or 'api_docs'")

    return {"source_id": source_id, "status": "pending"}


@router.get("/sources")
async def list_sources():
    return get_all_sources()


@router.get("/sources/{source_id}")
async def get_source_status(source_id: str):
    source = get_source(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return source
```

- [ ] **Step 2: Mount the router in `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db.sqlite import init_db
from app.db.qdrant import ensure_collection
from app.ingestion.router import router as ingestion_router

app = FastAPI(title="RepoLens API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingestion_router)

@app.on_event("startup")
async def startup():
    init_db()
    ensure_collection()

@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 3: Test the endpoint manually**

```bash
uvicorn app.main:app --reload
# In another terminal:
curl -X POST http://localhost:8000/ingest \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/tiangolo/fastapi", "source_type": "github"}'
```

Expected: `{"source_id": "some-uuid", "status": "pending"}`

```bash
curl http://localhost:8000/ingest/sources
```

Expected: list with the source you just submitted, status updating to "processing" then "complete".

- [ ] **Step 4: Commit**

```bash
git add backend/app/ingestion/router.py backend/app/main.py
git commit -m "feat: ingestion router with background job dispatch and status polling"
```

---

## Task 10: Semantic Search

**Files:**
- Create: `backend/app/retrieval/semantic.py`

- [ ] **Step 1: Write `backend/app/retrieval/semantic.py`**

```python
from qdrant_client.models import Filter, FieldCondition, MatchValue
from app.db.qdrant import get_qdrant, COLLECTION_NAME
from app.ingestion.embedder import embed_query

TOP_K = 10  # retrieve more than we need; RRF will rerank and we'll take top 5


def semantic_search(query: str, source_id: str) -> list[dict]:
    """
    Find the TOP_K chunks most semantically similar to the query,
    filtered to a specific source.

    WHY filter by source_id: a user can have multiple repos indexed.
    We only want results from the one they're currently chatting with.

    Returns list of {id, text, metadata, score} dicts.
    """
    query_vector = embed_query(query)
    qdrant = get_qdrant()

    results = qdrant.search(
        collection_name=COLLECTION_NAME,
        query_vector=query_vector,
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
        for r in results
    ]
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/retrieval/semantic.py
git commit -m "feat: semantic search via Qdrant cosine similarity"
```

---

## Task 11: BM25 Keyword Search

**Why BM25?** BM25 (Best Match 25) is the industry-standard keyword ranking algorithm. It finds chunks that contain the exact words in your query, weighted by term frequency and inverse document frequency. For code search this is crucial — if you ask "how does `authenticate_user` work?", semantic search might miss the exact function name while BM25 finds it immediately.

**Files:**
- Create: `backend/app/retrieval/keyword.py`
- Create: `backend/tests/test_hybrid.py`

- [ ] **Step 1: Write the failing test for RRF in `backend/tests/test_hybrid.py`**

```python
from app.retrieval.hybrid import reciprocal_rank_fusion


def test_rrf_combines_two_ranked_lists():
    semantic = ["chunk_a", "chunk_b", "chunk_c"]
    keyword = ["chunk_b", "chunk_d", "chunk_a"]
    result = reciprocal_rank_fusion([semantic, keyword])
    # chunk_b ranks 2nd in semantic and 1st in keyword → high combined score
    # chunk_a ranks 1st in semantic and 3rd in keyword → also high
    assert result[0] in ("chunk_a", "chunk_b")
    assert "chunk_d" in result


def test_rrf_handles_single_list():
    ranked = ["x", "y", "z"]
    result = reciprocal_rank_fusion([ranked])
    assert result == ["x", "y", "z"]


def test_rrf_deduplicates():
    list1 = ["a", "b"]
    list2 = ["a", "c"]
    result = reciprocal_rank_fusion([list1, list2])
    assert result.count("a") == 1
```

- [ ] **Step 2: Write `backend/app/retrieval/keyword.py`**

```python
from rank_bm25 import BM25Okapi
from app.db.sqlite import get_chunks_for_source

TOP_K = 10


def _tokenize(text: str) -> list[str]:
    """Simple whitespace + lowercase tokenizer. Good enough for code and prose."""
    return text.lower().split()


def keyword_search(query: str, source_id: str) -> list[dict]:
    """
    BM25 search over all chunks for the given source.

    WHY rebuild the index per search: BM25 is an in-memory index. Building it
    from SQLite on each query is ~50ms for a few hundred chunks — acceptable for
    a portfolio project. Production systems would cache the index per source.

    Returns list of {id, text, metadata} dicts ranked by BM25 score.
    """
    chunks = get_chunks_for_source(source_id)
    if not chunks:
        return []

    corpus = [_tokenize(c["text"]) for c in chunks]
    bm25 = BM25Okapi(corpus)

    query_tokens = _tokenize(query)
    scores = bm25.get_scores(query_tokens)

    # Pair chunks with scores, sort descending, take top K
    ranked = sorted(zip(chunks, scores), key=lambda x: x[1], reverse=True)
    return [
        {"id": c["id"], "text": c["text"], "metadata": c["metadata"], "score": float(s)}
        for c, s in ranked[:TOP_K]
        if s > 0  # skip zero-score chunks (no matching terms)
    ]
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/retrieval/keyword.py
git commit -m "feat: BM25 keyword search over SQLite chunk store"
```

---

## Task 12: Hybrid Search with RRF

**WHY Reciprocal Rank Fusion:** We have two ranked lists — semantic and keyword. We can't just average their scores because they're on different scales (cosine similarity vs BM25). RRF solves this by combining ranks, not scores. The formula is: `score(doc) = Σ 1 / (k + rank(doc))` where k=60 is a smoothing constant. A document that ranks high in both lists gets a very high combined score.

**Files:**
- Create: `backend/app/retrieval/hybrid.py`

- [ ] **Step 1: Write `backend/app/retrieval/hybrid.py`**

```python
from app.retrieval.semantic import semantic_search
from app.retrieval.keyword import keyword_search

RRF_K = 60  # standard constant — prevents high scores from dominating
TOP_N = 5   # final number of chunks to return to the chat pipeline


def reciprocal_rank_fusion(ranked_lists: list[list[str]], k: int = RRF_K) -> list[str]:
    """
    Merge multiple ranked lists of chunk IDs into one ranked list using RRF.

    WHY RRF over score averaging: scores from different systems aren't
    comparable (BM25 scores can be 0–15, cosine similarity is 0–1).
    RRF only uses rank position, making it model-agnostic and robust.
    """
    scores: dict[str, float] = {}
    for ranked_list in ranked_lists:
        for rank, doc_id in enumerate(ranked_list):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
    return sorted(scores, key=lambda x: scores[x], reverse=True)


def hybrid_search(query: str, source_id: str) -> list[dict]:
    """
    Run semantic + keyword search, merge with RRF, return top-N enriched chunks.
    """
    semantic_results = semantic_search(query, source_id)
    keyword_results = keyword_search(query, source_id)

    # Build id → chunk lookup from both result sets
    chunk_map: dict[str, dict] = {}
    for r in semantic_results + keyword_results:
        chunk_map[r["id"]] = r

    semantic_ids = [r["id"] for r in semantic_results]
    keyword_ids = [r["id"] for r in keyword_results]

    merged_ids = reciprocal_rank_fusion([semantic_ids, keyword_ids])

    return [chunk_map[cid] for cid in merged_ids[:TOP_N] if cid in chunk_map]
```

- [ ] **Step 2: Run the hybrid tests**

```bash
pytest tests/test_hybrid.py -v
```

Expected: all 3 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/app/retrieval/hybrid.py backend/tests/test_hybrid.py
git commit -m "feat: hybrid search with RRF merging semantic and BM25 results"
```

---

## Task 13: Chat Pipeline + SSE Router

**WHY Server-Sent Events (SSE)?** Streaming means the user sees tokens appearing as GPT-4o generates them, rather than waiting 10–30 seconds for the full response. SSE is a simple HTTP protocol where the server keeps a connection open and sends `data: ...` lines. The browser's `EventSource` API consumes these natively — no WebSocket complexity needed.

**Files:**
- Create: `backend/app/chat/pipeline.py`
- Create: `backend/app/chat/router.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write `backend/app/chat/pipeline.py`**

```python
import json
from openai import OpenAI
from app.config import settings
from app.retrieval.hybrid import hybrid_search

_client: OpenAI | None = None

SYSTEM_PROMPT = """You are RepoLens, an expert assistant that answers questions about
code repositories and API documentation. Answer based ONLY on the provided context.
If the context doesn't contain enough information, say so clearly.
Always reference which file or section your answer comes from."""


def get_openai() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=settings.openai_api_key)
    return _client


def _format_context(chunks: list[dict]) -> str:
    """
    Format retrieved chunks into a prompt context block.
    Each chunk is labelled with its source so GPT-4o can cite it.
    """
    parts = []
    for i, chunk in enumerate(chunks):
        meta = chunk["metadata"]
        if meta.get("source") == "github":
            label = f"[{i+1}] File: {meta.get('file_path')} (lines {meta.get('start_line')}–{meta.get('end_line')})"
        else:
            label = f"[{i+1}] Page: {meta.get('page_url')} — {meta.get('section_title')}"
        parts.append(f"{label}\n{chunk['text']}")
    return "\n\n---\n\n".join(parts)


def stream_chat(question: str, source_id: str):
    """
    Generator that yields SSE-formatted strings.

    Flow:
    1. Retrieve relevant chunks via hybrid search
    2. Format them into a context prompt
    3. Call GPT-4o with streaming
    4. Yield each token as an SSE event
    5. Yield citations as a final SSE event
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
        temperature=0.1,  # low temperature for factual, grounded answers
    )

    for event in stream:
        delta = event.choices[0].delta
        if delta.content:
            yield f"data: {json.dumps({'type': 'token', 'content': delta.content})}\n\n"

    # After all tokens, send citations
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
```

- [ ] **Step 2: Write `backend/app/chat/router.py`**

```python
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.chat.pipeline import stream_chat

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    question: str
    source_id: str


@router.post("")
async def chat(req: ChatRequest):
    """
    Stream a GPT-4o answer grounded in the indexed source.
    Response is text/event-stream — the client uses EventSource to consume it.
    """
    return StreamingResponse(
        stream_chat(req.question, req.source_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # tells Nginx not to buffer the stream
        },
    )
```

- [ ] **Step 3: Mount chat router in `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db.sqlite import init_db
from app.db.qdrant import ensure_collection
from app.ingestion.router import router as ingestion_router
from app.chat.router import router as chat_router

app = FastAPI(title="RepoLens API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingestion_router)
app.include_router(chat_router)

@app.on_event("startup")
async def startup():
    init_db()
    ensure_collection()

@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 4: Test streaming manually**

First index a small repo (Task 9 test), then:

```bash
curl -N -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "what does this repo do?", "source_id": "your-source-id-here"}'
```

Expected: a stream of `data: {"type": "token", "content": "..."}` lines appearing one by one, ending with citations and `data: {"type": "done"}`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/chat/pipeline.py backend/app/chat/router.py backend/app/main.py
git commit -m "feat: streaming chat pipeline with GPT-4o, hybrid search context, and SSE"
```

---

## Task 14: Eval Runner

**WHY evals matter:** Without evals, you're flying blind — you don't know if a chunking change improved or hurt retrieval, or if your prompt change made answers more faithful. Evals give you a repeatable score so changes can be measured. This is what separates a toy RAG demo from an engineering-grade system.

**Files:**
- Create: `backend/app/evals/runner.py`
- Create: `backend/tests/test_eval_runner.py`

- [ ] **Step 1: Write the failing test in `backend/tests/test_eval_runner.py`**

```python
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
```

- [ ] **Step 2: Run to verify failures**

```bash
pytest tests/test_eval_runner.py -v
```

Expected: `ImportError` — runner doesn't exist yet.

- [ ] **Step 3: Write `backend/app/evals/runner.py`**

```python
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
    Used as a cheap retrieval quality proxy — measures if expected answer
    keywords appear in retrieved chunks.

    WHY F1 not just precision or recall: F1 balances both. High precision
    means retrieved tokens are relevant; high recall means we got all the
    important tokens. F1 penalizes extremes.
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
    """Extract scores from the LLM judge's structured response."""
    faith_match = re.search(r"FAITHFULNESS:\s*(\d+)", response)
    rel_match = re.search(r"RELEVANCE:\s*(\d+)", response)
    reason_match = re.search(r"REASONING:\s*(.+)", response)
    return {
        "faithfulness": float(faith_match.group(1)) if faith_match else None,
        "relevance": float(rel_match.group(1)) if rel_match else None,
        "reasoning": reason_match.group(1).strip() if reason_match else "",
    }


def _generate_answer(question: str, source_id: str) -> str:
    """Run the chat pipeline and collect the full streamed answer."""
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
    Run the full eval suite for a source against a test dataset.
    Stores per-question results in SQLite and returns aggregate metrics.
    """
    with open(dataset_path) as f:
        dataset = json.load(f)

    client = get_openai()
    run_at = datetime.now(timezone.utc).isoformat()
    results = []

    for item in dataset:
        question = item["question"]
        expected_answer = item["expected_answer"]

        # Retrieval eval: how much of the expected answer is in retrieved chunks?
        retrieved_chunks = hybrid_search(question, source_id)
        retrieved_text = " ".join(c["text"] for c in retrieved_chunks)
        f1 = token_overlap_f1(expected_answer, retrieved_text)

        # Generate answer
        generated_answer = _generate_answer(question, source_id)

        # LLM-as-judge
        judge_input = JUDGE_PROMPT.format(
            question=question,
            expected_answer=expected_answer,
            generated_answer=generated_answer,
            context=retrieved_text[:2000],
        )
        judge_resp = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": judge_input}],
            temperature=0,
        )
        judge_text = judge_resp.choices[0].message.content
        scores = parse_judge_response(judge_text)

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
```

- [ ] **Step 4: Run the unit tests**

```bash
pytest tests/test_eval_runner.py -v
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/evals/runner.py backend/tests/test_eval_runner.py
git commit -m "feat: eval runner with token-overlap retrieval metric and LLM-as-judge scoring"
```

---

## Task 15: Eval Router + Test Datasets

**Files:**
- Create: `backend/app/evals/router.py`
- Create: `evals/datasets/github_qa.json`
- Create: `evals/datasets/api_docs_qa.json`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write `backend/app/evals/router.py`**

```python
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from app.db.sqlite import get_eval_results
from app.evals.runner import run_evals

router = APIRouter(prefix="/evals", tags=["evals"])

# Map source_type → dataset path
DATASET_PATHS = {
    "github": "../evals/datasets/github_qa.json",
    "api_docs": "../evals/datasets/api_docs_qa.json",
}


class EvalRunRequest(BaseModel):
    source_id: str
    source_type: str  # "github" or "api_docs"


@router.post("/run")
async def trigger_eval_run(req: EvalRunRequest, background_tasks: BackgroundTasks):
    dataset_path = DATASET_PATHS.get(req.source_type)
    if not dataset_path:
        raise HTTPException(status_code=400, detail="Invalid source_type")
    background_tasks.add_task(run_evals, req.source_id, dataset_path)
    return {"status": "eval run started"}


@router.get("/results/{source_id}")
async def get_results(source_id: str):
    results = get_eval_results(source_id)
    if not results:
        return {"results": [], "summary": None}

    avg_f1 = sum(r["token_overlap_f1"] or 0 for r in results) / len(results)
    avg_faith = sum(r["faithfulness"] or 0 for r in results) / len(results)
    avg_rel = sum(r["relevance"] or 0 for r in results) / len(results)

    return {
        "results": results,
        "summary": {
            "total": len(results),
            "avg_token_overlap_f1": round(avg_f1, 3),
            "avg_faithfulness": round(avg_faith, 2),
            "avg_relevance": round(avg_rel, 2),
        },
    }
```

- [ ] **Step 2: Write `evals/datasets/github_qa.json`**

```json
[
  {
    "question": "What is the main purpose of this repository?",
    "expected_answer": "This repository contains the FastAPI framework for building APIs with Python"
  },
  {
    "question": "How do you define a route in FastAPI?",
    "expected_answer": "Routes are defined using decorators like @app.get() or @app.post() on async functions"
  },
  {
    "question": "How does FastAPI handle request body validation?",
    "expected_answer": "FastAPI uses Pydantic models to validate request bodies automatically"
  },
  {
    "question": "What is dependency injection in FastAPI?",
    "expected_answer": "FastAPI's Depends() system allows injecting shared logic like database sessions or authentication into route handlers"
  },
  {
    "question": "How do you add middleware in FastAPI?",
    "expected_answer": "Middleware is added using app.add_middleware() with a middleware class"
  }
]
```

- [ ] **Step 3: Write `evals/datasets/api_docs_qa.json`**

```json
[
  {
    "question": "What authentication methods are supported?",
    "expected_answer": "The API supports API key authentication via Bearer tokens in the Authorization header"
  },
  {
    "question": "How do you paginate results?",
    "expected_answer": "Pagination uses cursor-based pagination with next_cursor and limit parameters"
  },
  {
    "question": "What is the base URL for the API?",
    "expected_answer": "The base URL is https://api.example.com/v1"
  },
  {
    "question": "How are errors returned?",
    "expected_answer": "Errors are returned as JSON with error code and message fields"
  },
  {
    "question": "What rate limits apply?",
    "expected_answer": "The API allows 1000 requests per minute per API key"
  }
]
```

> **Note:** These are placeholder Q&A pairs. After indexing a real repo, update the dataset with real questions and answers from that specific source.

- [ ] **Step 4: Mount evals router in `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db.sqlite import init_db
from app.db.qdrant import ensure_collection
from app.ingestion.router import router as ingestion_router
from app.chat.router import router as chat_router
from app.evals.router import router as evals_router

app = FastAPI(title="RepoLens API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingestion_router)
app.include_router(chat_router)
app.include_router(evals_router)

@app.on_event("startup")
async def startup():
    init_db()
    ensure_collection()

@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/evals/router.py backend/app/main.py evals/
git commit -m "feat: evals router + placeholder test datasets"
```

---

## Task 16: Frontend Setup

**Files:**
- Create: `frontend/` (via Vite scaffold)

- [ ] **Step 1: Scaffold React + TypeScript app with Vite**

```bash
cd "c:/Users/SahilManojDeshmukh/Desktop/code/personal/RepoLens RAG"
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @tanstack/react-query axios tailwindcss @tailwindcss/vite lucide-react
npm install -D @types/node
```

- [ ] **Step 3: Install and init shadcn/ui**

```bash
npx shadcn@latest init
```

When prompted:
- Style: Default
- Base color: Slate
- CSS variables: Yes

Then add the components we need:

```bash
npx shadcn@latest add button input card badge scroll-area separator tabs
```

- [ ] **Step 4: Configure Tailwind in `frontend/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

- [ ] **Step 5: Update `frontend/src/index.css`**

```css
@import "tailwindcss";
```

- [ ] **Step 6: Wrap app with QueryClient in `frontend/src/main.tsx`**

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 7: Verify the app runs**

```bash
npm run dev
```

Expected: Vite dev server at `http://localhost:5173` showing the default React app.

- [ ] **Step 8: Commit**

```bash
cd ..
git add frontend/
git commit -m "feat: React + TypeScript frontend with Vite, Tailwind, shadcn/ui"
```

---

## Task 17: API Client + TypeScript Types

**Files:**
- Create: `frontend/src/types.ts`
- Create: `frontend/src/lib/api.ts`

- [ ] **Step 1: Write `frontend/src/types.ts`**

```typescript
export interface Source {
  id: string
  url: string
  source_type: 'github' | 'api_docs'
  name: string
  status: 'pending' | 'processing' | 'complete' | 'failed'
  chunk_count: number
  error: string | null
  created_at: string
}

export interface Citation {
  index: number
  file_path?: string
  start_line?: number
  end_line?: number
  repo_url?: string
  page_url?: string
  section_title?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
}

export interface EvalResult {
  id: string
  source_id: string
  run_at: string
  question: string
  generated_answer: string
  expected_answer: string
  retrieved_texts: string
  token_overlap_f1: number
  faithfulness: number | null
  relevance: number | null
  judge_reasoning: string
}

export interface EvalSummary {
  total: number
  avg_token_overlap_f1: number
  avg_faithfulness: number
  avg_relevance: number
}
```

- [ ] **Step 2: Write `frontend/src/lib/api.ts`**

```typescript
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function ingestSource(url: string, source_type: 'github' | 'api_docs') {
  const res = await fetch(`${API_BASE}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, source_type }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchSources() {
  const res = await fetch(`${API_BASE}/ingest/sources`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchSourceStatus(sourceId: string) {
  const res = await fetch(`${API_BASE}/ingest/sources/${sourceId}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function triggerEvalRun(source_id: string, source_type: string) {
  const res = await fetch(`${API_BASE}/evals/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_id, source_type }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchEvalResults(sourceId: string) {
  const res = await fetch(`${API_BASE}/evals/results/${sourceId}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

/**
 * Stream a chat response using the Fetch API with ReadableStream.
 * Calls onToken for each text token, onCitations when citations arrive, onDone when complete.
 *
 * WHY not EventSource: EventSource only supports GET requests. Our chat endpoint
 * needs POST (to send the question in the body). We use fetch + ReadableStream instead,
 * which gives us the same streaming behavior with full request control.
 */
export async function streamChat(
  question: string,
  sourceId: string,
  onToken: (token: string) => void,
  onCitations: (citations: any[]) => void,
  onDone: () => void,
) {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, source_id: sourceId }),
  })

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = JSON.parse(line.slice(6))
      if (payload.type === 'token') onToken(payload.content)
      else if (payload.type === 'citations') onCitations(payload.citations)
      else if (payload.type === 'done') onDone()
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types.ts frontend/src/lib/api.ts
git commit -m "feat: TypeScript types and API client with streaming support"
```

---

## Task 18: Sidebar Component

**Files:**
- Create: `frontend/src/hooks/useIngest.ts`
- Create: `frontend/src/hooks/useSources.ts`
- Create: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Write `frontend/src/hooks/useSources.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { fetchSources } from '@/lib/api'
import { Source } from '@/types'

export function useSources(activeSourceId: string | null) {
  return useQuery<Source[]>({
    queryKey: ['sources'],
    queryFn: fetchSources,
    // Poll every 3s when any source is still processing
    refetchInterval: (query) => {
      const sources = query.state.data || []
      const hasProcessing = sources.some(
        (s: Source) => s.status === 'pending' || s.status === 'processing'
      )
      return hasProcessing ? 3000 : false
    },
  })
}
```

- [ ] **Step 2: Write `frontend/src/hooks/useIngest.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ingestSource } from '@/lib/api'

export function useIngest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ url, source_type }: { url: string; source_type: 'github' | 'api_docs' }) =>
      ingestSource(url, source_type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] })
    },
  })
}
```

- [ ] **Step 3: Write `frontend/src/components/Sidebar.tsx`**

```typescript
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useSources } from '@/hooks/useSources'
import { useIngest } from '@/hooks/useIngest'
import { Source } from '@/types'
import { Github, Globe, Loader2 } from 'lucide-react'

interface SidebarProps {
  activeSourceId: string | null
  onSelectSource: (source: Source) => void
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  complete: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
}

export function Sidebar({ activeSourceId, onSelectSource }: SidebarProps) {
  const [url, setUrl] = useState('')
  const [sourceType, setSourceType] = useState<'github' | 'api_docs'>('github')
  const { data: sources = [], isLoading } = useSources(activeSourceId)
  const ingest = useIngest()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    ingest.mutate({ url: url.trim(), source_type: sourceType })
    setUrl('')
  }

  return (
    <div className="w-72 border-r flex flex-col h-screen bg-background">
      <div className="p-4 font-bold text-lg border-b">RepoLens</div>

      <div className="p-4 space-y-3">
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSourceType('github')}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded border text-sm
                ${sourceType === 'github' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
            >
              <Github size={14} /> GitHub
            </button>
            <button
              type="button"
              onClick={() => setSourceType('api_docs')}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded border text-sm
                ${sourceType === 'api_docs' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
            >
              <Globe size={14} /> API Docs
            </button>
          </div>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={sourceType === 'github' ? 'https://github.com/owner/repo' : 'https://docs.example.com'}
          />
          <Button type="submit" className="w-full" disabled={ingest.isPending}>
            {ingest.isPending ? <Loader2 className="animate-spin" size={16} /> : 'Index'}
          </Button>
        </form>
      </div>

      <Separator />

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading && <p className="text-sm text-muted-foreground px-2">Loading...</p>}
          {sources.map((source) => (
            <button
              key={source.id}
              onClick={() => source.status === 'complete' && onSelectSource(source)}
              disabled={source.status !== 'complete'}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors
                ${activeSourceId === source.id ? 'bg-accent' : 'hover:bg-accent/50'}
                ${source.status !== 'complete' ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{source.name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLORS[source.status]}`}>
                  {source.status === 'processing' && <Loader2 className="inline animate-spin" size={10} />}
                  {' '}{source.status}
                </span>
              </div>
              {source.chunk_count > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">{source.chunk_count} chunks</p>
              )}
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Sidebar.tsx frontend/src/hooks/
git commit -m "feat: Sidebar component with URL input, source list, and status polling"
```

---

## Task 19: Chat Component

**Files:**
- Create: `frontend/src/components/Message.tsx`
- Create: `frontend/src/components/Chat.tsx`

- [ ] **Step 1: Write `frontend/src/components/Message.tsx`**

```typescript
import { useState } from 'react'
import { Message, Citation } from '@/types'
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'

function CitationItem({ citation }: { citation: Citation }) {
  if (citation.file_path) {
    return (
      <div className="text-xs bg-muted px-2 py-1 rounded font-mono">
        [{citation.index}] {citation.file_path}
        {citation.start_line && ` :${citation.start_line}–${citation.end_line}`}
      </div>
    )
  }
  return (
    <a
      href={citation.page_url}
      target="_blank"
      rel="noreferrer"
      className="text-xs flex items-center gap-1 text-blue-600 hover:underline"
    >
      <ExternalLink size={10} />
      [{citation.index}] {citation.section_title || citation.page_url}
    </a>
  )
}

export function MessageBubble({ message }: { message: Message }) {
  const [showCitations, setShowCitations] = useState(false)
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap
            ${isUser
              ? 'bg-primary text-primary-foreground rounded-br-sm'
              : 'bg-muted rounded-bl-sm'}`}
        >
          {message.content}
          {!message.content && (
            <span className="inline-block w-1.5 h-4 bg-current animate-pulse ml-0.5" />
          )}
        </div>

        {message.citations && message.citations.length > 0 && (
          <div className="text-xs">
            <button
              onClick={() => setShowCitations(!showCitations)}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              {showCitations ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {message.citations.length} source{message.citations.length > 1 ? 's' : ''}
            </button>
            {showCitations && (
              <div className="mt-1 space-y-1">
                {message.citations.map((c) => (
                  <CitationItem key={c.index} citation={c} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write `frontend/src/components/Chat.tsx`**

```typescript
import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageBubble } from './Message'
import { streamChat } from '@/lib/api'
import { Message, Source } from '@/types'
import { Send } from 'lucide-react'
import { nanoid } from 'nanoid'  // add: npm install nanoid

interface ChatProps {
  source: Source
}

export function Chat({ source }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const question = input.trim()
    if (!question || isStreaming) return
    setInput('')

    const userMsg: Message = { id: nanoid(), role: 'user', content: question }
    const assistantMsgId = nanoid()
    const assistantMsg: Message = { id: assistantMsgId, role: 'assistant', content: '' }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setIsStreaming(true)

    await streamChat(
      question,
      source.id,
      (token) => {
        setMessages((prev) =>
          prev.map((m) => m.id === assistantMsgId ? { ...m, content: m.content + token } : m)
        )
      },
      (citations) => {
        setMessages((prev) =>
          prev.map((m) => m.id === assistantMsgId ? { ...m, citations } : m)
        )
      },
      () => setIsStreaming(false),
    )
  }

  return (
    <div className="flex flex-col h-screen flex-1">
      <div className="border-b px-4 py-3 text-sm text-muted-foreground">
        Chatting with <span className="font-semibold text-foreground">{source.name}</span>
        <span className="ml-2 text-xs">({source.chunk_count} chunks indexed)</span>
      </div>

      <ScrollArea className="flex-1 px-4 py-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground mt-8">
            Ask anything about <strong>{source.name}</strong>
          </p>
        )}
        {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
        <div ref={bottomRef} />
      </ScrollArea>

      <div className="border-t px-4 py-3 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Ask a question..."
          disabled={isStreaming}
        />
        <Button onClick={handleSend} disabled={isStreaming || !input.trim()}>
          <Send size={16} />
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Install nanoid**

```bash
npm install nanoid
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/
git commit -m "feat: Chat component with token streaming and collapsible source citations"
```

---

## Task 20: Evals Tab

**Files:**
- Create: `frontend/src/hooks/useEvals.ts`
- Create: `frontend/src/components/EvalsTab.tsx`

- [ ] **Step 1: Write `frontend/src/hooks/useEvals.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchEvalResults, triggerEvalRun } from '@/lib/api'

export function useEvals(sourceId: string) {
  const queryClient = useQueryClient()

  const results = useQuery({
    queryKey: ['evals', sourceId],
    queryFn: () => fetchEvalResults(sourceId),
    enabled: !!sourceId,
  })

  const runEvals = useMutation({
    mutationFn: ({ source_type }: { source_type: string }) =>
      triggerEvalRun(sourceId, source_type),
    onSuccess: () => {
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['evals', sourceId] }), 3000)
    },
  })

  return { results, runEvals }
}
```

- [ ] **Step 2: Write `frontend/src/components/EvalsTab.tsx`**

```typescript
import { Button } from '@/components/ui/button'
import { useEvals } from '@/hooks/useEvals'
import { Source, EvalResult } from '@/types'
import { Loader2, Play } from 'lucide-react'

interface EvalsTabProps {
  source: Source
}

function ScoreBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>
  const color = value >= 4 ? 'text-green-600' : value >= 3 ? 'text-yellow-600' : 'text-red-600'
  return <span className={`font-semibold ${color}`}>{value.toFixed(1)}</span>
}

export function EvalsTab({ source }: EvalsTabProps) {
  const { results, runEvals } = useEvals(source.id)
  const data = results.data

  return (
    <div className="flex flex-col h-screen flex-1">
      <div className="border-b px-4 py-3 flex items-center justify-between">
        <div>
          <p className="font-semibold">Evals — {source.name}</p>
          <p className="text-xs text-muted-foreground">
            Measures retrieval quality + answer faithfulness
          </p>
        </div>
        <Button
          onClick={() => runEvals.mutate({ source_type: source.source_type })}
          disabled={runEvals.isPending}
          size="sm"
        >
          {runEvals.isPending ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />}
          <span className="ml-1">Run Evals</span>
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {data?.summary && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-muted rounded-lg p-4 text-center">
              <p className="text-2xl font-bold">{data.summary.avg_token_overlap_f1.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">Retrieval F1</p>
            </div>
            <div className="bg-muted rounded-lg p-4 text-center">
              <p className="text-2xl font-bold">{data.summary.avg_faithfulness.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground mt-1">Avg Faithfulness</p>
            </div>
            <div className="bg-muted rounded-lg p-4 text-center">
              <p className="text-2xl font-bold">{data.summary.avg_relevance.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground mt-1">Avg Relevance</p>
            </div>
          </div>
        )}

        {data?.results?.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-left">
                <th className="pb-2 w-[40%]">Question</th>
                <th className="pb-2">F1</th>
                <th className="pb-2">Faith.</th>
                <th className="pb-2">Rel.</th>
                <th className="pb-2">Reasoning</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((r: EvalResult) => (
                <tr key={r.id} className="border-b hover:bg-muted/50">
                  <td className="py-2 pr-4">{r.question}</td>
                  <td className="py-2"><ScoreBadge value={r.token_overlap_f1} /></td>
                  <td className="py-2"><ScoreBadge value={r.faithfulness} /></td>
                  <td className="py-2"><ScoreBadge value={r.relevance} /></td>
                  <td className="py-2 text-xs text-muted-foreground">{r.judge_reasoning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground text-center mt-8">
            No eval results yet. Click "Run Evals" to start.
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/EvalsTab.tsx frontend/src/hooks/useEvals.ts
git commit -m "feat: Evals tab with summary metrics and per-question results table"
```

---

## Task 21: Wire Up App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Write `frontend/src/App.tsx`**

```typescript
import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sidebar } from '@/components/Sidebar'
import { Chat } from '@/components/Chat'
import { EvalsTab } from '@/components/EvalsTab'
import { Source } from '@/types'
import { MessageSquare, FlaskConical } from 'lucide-react'

export default function App() {
  const [activeSource, setActiveSource] = useState<Source | null>(null)

  return (
    <div className="flex h-screen bg-background">
      <Sidebar activeSourceId={activeSource?.id || null} onSelectSource={setActiveSource} />

      <div className="flex-1 overflow-hidden">
        {activeSource ? (
          <Tabs defaultValue="chat" className="h-full flex flex-col">
            <TabsList className="mx-4 mt-3 w-fit">
              <TabsTrigger value="chat" className="flex items-center gap-1.5">
                <MessageSquare size={14} /> Chat
              </TabsTrigger>
              <TabsTrigger value="evals" className="flex items-center gap-1.5">
                <FlaskConical size={14} /> Evals
              </TabsTrigger>
            </TabsList>
            <TabsContent value="chat" className="flex-1 overflow-hidden mt-0">
              <Chat source={activeSource} />
            </TabsContent>
            <TabsContent value="evals" className="flex-1 overflow-hidden mt-0">
              <EvalsTab source={activeSource} />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-lg font-semibold">Welcome to RepoLens</p>
              <p className="text-sm mt-1">Index a GitHub repo or API docs to get started</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run the full app and do an end-to-end test**

```bash
# Terminal 1 — backend
cd backend && uvicorn app.main:app --reload

# Terminal 2 — frontend
cd frontend && npm run dev
```

1. Open `http://localhost:5173`
2. Select "GitHub" tab, paste `https://github.com/tiangolo/fastapi`, click Index
3. Watch status change from pending → processing → complete in sidebar
4. Click the source, ask: "How do I define a route?"
5. Verify streaming response appears with source citations
6. Switch to Evals tab, click Run Evals, wait for results

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire up App with Sidebar, Chat, and Evals tabs"
```

---

## Task 22: Deployment

**Files:**
- Create: `backend/render.yaml`
- Create: `frontend/.env.production`

- [ ] **Step 1: Create Render config `backend/render.yaml`**

```yaml
services:
  - type: web
    name: repolens-api
    runtime: python
    buildCommand: pip install -r requirements.txt && crawl4ai-setup
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: OPENAI_API_KEY
        sync: false
      - key: QDRANT_URL
        sync: false
      - key: QDRANT_API_KEY
        sync: false
      - key: GITHUB_TOKEN
        sync: false
    disk:
      name: repolens-data
      mountPath: /opt/render/project/src
      sizeGB: 1
```

> **Why disk?** SQLite writes to the local filesystem. Without a persistent disk, Render's ephemeral filesystem loses data on every deploy. The 1GB disk persists across deploys.

- [ ] **Step 2: Push and deploy backend to Render**

1. Go to https://render.com → New → Web Service
2. Connect your GitHub repo
3. Set root directory to `backend/`
4. Render detects `render.yaml` automatically
5. In Environment tab, add your 4 secret env vars
6. Deploy — copy the generated URL (e.g. `https://repolens-api.onrender.com`)

- [ ] **Step 3: Configure frontend for production**

Create `frontend/.env.production`:
```
VITE_API_URL=https://repolens-api.onrender.com
```

- [ ] **Step 4: Deploy frontend to Vercel**

```bash
cd frontend
npx vercel --prod
```

Follow prompts. Vercel auto-detects Vite. Set `VITE_API_URL` in Vercel dashboard → Project Settings → Environment Variables.

- [ ] **Step 5: Smoke test the deployed app**

1. Open the Vercel URL
2. Index `https://github.com/tiangolo/fastapi`
3. Ask a question, verify streaming and citations work
4. Run evals, verify results appear

- [ ] **Step 6: Final commit**

```bash
git add backend/render.yaml frontend/.env.production
git commit -m "chore: add Render and Vercel deployment config"
git push
```

---

## Backend Test Run

Run all backend tests at any point:

```bash
cd backend
pytest tests/ -v
```

Expected passing tests:
- `tests/test_chunker.py` — 5 tests
- `tests/test_hybrid.py` — 3 tests
- `tests/test_eval_runner.py` — 5 tests

Total: **13 tests**
