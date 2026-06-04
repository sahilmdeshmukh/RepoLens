

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
