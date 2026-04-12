from fastapi import APIRouter, Body, HTTPException
from typing import Any, Dict

from services.agent_service import chat_with_coach

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("")
async def chat(payload: Dict[str, Any] = Body(...)):
    message = (payload.get("message") or "").strip()
    chat_history = payload.get("chat_history", [])

    if not message:
        raise HTTPException(status_code=400, detail="Missing message")

    result = chat_with_coach(message=message, chat_history=chat_history)
    return {
        "status": "success",
        "reply": result["reply"],
        "should_create_task": result["should_create_task"],
    }
