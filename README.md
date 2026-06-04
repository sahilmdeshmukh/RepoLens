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
.venv\Scripts\activate      # Windows
# source .venv/bin/activate # macOS/Linux
pip install -r requirements.txt
cp .env.example .env        # fill in your keys
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Running Tests
```bash
cd backend
pytest -v
```

## Environment Variables

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key for embeddings and GPT-4o |
| `QDRANT_URL` | Qdrant Cloud cluster URL |
| `QDRANT_API_KEY` | Qdrant Cloud API key |
| `GITHUB_TOKEN` | GitHub personal access token (optional, raises API rate limit) |
