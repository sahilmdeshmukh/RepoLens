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

    Returns a text/event-stream response — the client reads it with
    the Fetch API (ReadableStream) to display tokens as they arrive.
    """
    return StreamingResponse(
        stream_chat(req.question, req.source_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # tells Nginx not to buffer — important for streaming
        },
    )
