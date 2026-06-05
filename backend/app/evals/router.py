from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from app.db.sqlite import get_eval_results
from app.evals.runner import run_evals

router = APIRouter(prefix="/evals", tags=["evals"])

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
