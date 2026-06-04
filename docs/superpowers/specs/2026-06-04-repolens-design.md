# RepoLens — Design Spec
**Date:** 2026-06-04  
**Status:** Approved

## Overview

RepoLens is a portfolio RAG (Retrieval-Augmented Generation) application that indexes GitHub repositories and API documentation, then lets users ask natural language questions about the code and docs via a chat interface. It features source-aware ingestion, hybrid search, streaming responses, source citations, and a built-in eval dashboard.

---

## Goals

- Index public GitHub repos (via URL) and API docs sites (via URL)
- Answer both code-level questions ("how is auth implemented?") and API usage questions ("how do I paginate?")
- Stream answers with source citations back to the user
- Run retrieval + answer quality evals and display results in the UI
- Deploy publicly so it can be shared as a live portfolio link
- Serve as a learning project — implementation should be explained step by step

---

## Architecture

```
[User]
  → pastes GitHub repo URL or API docs URL
  → [React Frontend] sends to [FastAPI Backend]

INGESTION:
  FastAPI → Ingestion Router
    → GitHub Pipeline: fetch repo → AST-aware chunking (tree-sitter) → embed → store
    → API Docs Pipeline: crawl HTML (crawl4ai) → section chunking → embed → store
  Chunks + metadata → Qdrant Cloud (vector DB)
  Job/session/eval metadata → SQLite

QUERY:
  FastAPI → Hybrid Search
    → Semantic search via Qdrant (text-embedding-3-small)
    → Keyword search via BM25 (rank-bm25)
    → Merge with Reciprocal Rank Fusion (RRF)
  → Top 5–8 chunks assembled into prompt
  → GPT-4o streams response back to React chat UI
  → Source citations included in response

EVALS:
  Eval runner reads test dataset (JSON)
  → Retrieval evals: Precision@K, Recall@K (no LLM needed)
  → Answer evals: GPT-4o as judge (faithfulness + relevance, scored 1–5)
  → Results stored in SQLite
  → Displayed in Evals tab in frontend
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python) |
| Vector DB | Qdrant Cloud (free tier) |
| Metadata / Evals DB | SQLite |
| Embeddings | OpenAI text-embedding-3-small |
| LLM | OpenAI GPT-4o |
| AST Chunking | tree-sitter |
| Keyword Search | rank-bm25 |
| Web Crawling | crawl4ai |
| Frontend | React + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| API State | react-query |
| Streaming | EventSource (SSE) |
| Backend Deploy | Render (free tier) |
| Frontend Deploy | Vercel (free tier) |
| Repo | GitHub |

---

## Ingestion Pipeline

### GitHub Repos
1. User submits a GitHub repo URL (e.g. `https://github.com/owner/repo`)
2. Backend clones the repo using `gitpython` or fetches via GitHub API
3. Walk the file tree, skip binaries and non-code files (`.gitignore`-aware)
4. **Code files** (`.py`, `.js`, `.ts`, `.go`, etc.) — split by function/class boundaries using tree-sitter (AST-aware)
5. **Markdown/README files** — split by heading sections
6. Each chunk metadata: `{source: "github", repo_url, file_path, language, start_line, end_line, chunk_type}`

### API Docs Sites
1. User submits an API docs URL (e.g. `https://stripe.com/docs/api`)
2. Crawl the site using `crawl4ai` (handles JS-rendered pages), starting from the submitted URL
3. Split HTML into sections by heading tags (`h1`–`h3`) and endpoint blocks
4. Each chunk metadata: `{source: "api_docs", base_url, page_url, section_title, endpoint}`

### Both Paths
- Embed chunks using `text-embedding-3-small`
- Upsert into Qdrant with full metadata
- Track job status (`pending → processing → complete → failed`) in SQLite
- Background job via FastAPI `BackgroundTasks` — UI polls for progress

---

## Query Pipeline

1. **Embed query** — same model as ingestion (`text-embedding-3-small`)
2. **Hybrid search** — semantic (Qdrant) + keyword (BM25) run in parallel
3. **Merge** — Reciprocal Rank Fusion (RRF) combines ranked lists
4. **Context assembly** — top 5–8 chunks formatted with metadata into GPT-4o prompt
5. **Stream response** — GPT-4o streams answer via SSE to frontend
6. **Source citations** — each response includes which chunks were used (file path + line range or page URL + section)

---

## Evals

### Test Dataset
- JSON file in `evals/` directory, ~20–30 Q&A pairs per source type
- Format: `{question, expected_answer, source_url, relevant_chunk_ids}`
- Hand-curated, committed to the repo for reproducibility

### Retrieval Evals (no LLM)
- **Precision@K** — fraction of retrieved chunks that are relevant
- **Recall@K** — fraction of relevant chunks that were retrieved

### Answer Evals (LLM-as-judge)
- GPT-4o given: question + generated answer + expected answer
- Scores **faithfulness** (1–5): is the answer grounded in context, not hallucinated?
- Scores **relevance** (1–5): does the answer address the question?
- Full reasoning stored in SQLite for debugging

### Eval Dashboard
- Trigger eval run from the UI (Evals tab)
- Per-question results table: question | chunks retrieved | answer | faithfulness | relevance
- Aggregate metrics shown at top

---

## Frontend

### Sidebar
- URL input + "Index" button
- Progress bar/spinner during ingestion
- List of indexed sources (name, type, status)
- Click source to set as active chat context

### Chat View
- Message history with streamed responses (blinking cursor)
- Collapsible source citations per message
- Active source shown at top ("Chatting with: `facebook/react`")

### Evals Tab
- Trigger eval run
- Progress indicator
- Results table + aggregate summary

---

## Deployment

| Service | Platform | Cost |
|---|---|---|
| Backend (FastAPI) | Render free tier | Free (sleeps after 15min) |
| Frontend (React) | Vercel free tier | Free |
| Vector DB | Qdrant Cloud free tier | Free |
| Metadata DB | SQLite on Render disk | Free |
| Embeddings + LLM | OpenAI API | ~$1–5 total for demo usage |

### Environment Variables
- `OPENAI_API_KEY` — stored in Render secrets
- `QDRANT_URL` + `QDRANT_API_KEY` — stored in Render secrets
- `VITE_API_URL` — Render backend URL, set in Vercel env vars

---

## Repo Structure

```
RepoLens/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app entry
│   │   ├── ingestion/        # GitHub + API docs pipelines
│   │   ├── retrieval/        # Hybrid search, RRF
│   │   ├── chat/             # Query pipeline, streaming
│   │   ├── evals/            # Eval runner
│   │   └── db/               # SQLite models + Qdrant client
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/       # Chat, Sidebar, Evals
│   │   ├── hooks/            # react-query hooks
│   │   └── App.tsx
│   └── package.json
├── evals/
│   └── datasets/             # JSON test datasets
└── docs/
    └── superpowers/specs/    # This file
```
