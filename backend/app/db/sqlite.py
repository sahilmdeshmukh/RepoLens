import sqlite3
import json
from pathlib import Path

DB_PATH = Path("repolens.db")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # makes rows behave like dicts: row["id"] instead of row[0]
    return conn


def init_db():
    """Create all tables if they don't exist. Safe to call on every startup."""
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
