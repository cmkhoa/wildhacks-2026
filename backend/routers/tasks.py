from fastapi import APIRouter, Depends, HTTPException, Body
from typing import Dict, Any
import datetime

# In a real setup, we would rely on absolute imports or package structure
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.agent_service import parse_user_task
from services.google_service import create_calendar_event, create_drive_doc, get_calendar_service, get_drive_service
from models import Task, Subtask

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

# Dependency for DB Session
# def get_session(): ...

@router.post("/process")
async def process_task(payload: Dict[str, Any] = Body(...)):
    """
    Takes user's brain dump, parses it with Gemini, and sets up their workspace.
    Requires 'user_input' in payload. Optionally takes 'access_token' to build google resources immediately.
    """
    user_input = payload.get("user_input")
    if not user_input:
        raise HTTPException(status_code=400, detail="Missing user_input")
        
    access_token = payload.get("access_token")
    refresh_token = payload.get("refresh_token")
    
    # 1. Parse with Gemini LLM
    parsed_data = parse_user_task(user_input)
    
    doc_link = None
    calendar_id = None
    
    # 2. Optionally hook into Google APIs if user has authenticated
    if access_token and refresh_token:
        # Create Google Doc if AI suggests it
        if parsed_data.get("needs_doc"):
            drive_srv = get_drive_service(access_token, refresh_token)
            doc_link = create_drive_doc(drive_srv, parsed_data.get("doc_title", parsed_data.get("title", "New Task Doc")))
            
        # Schedule in Calendar
        cal_srv = get_calendar_service(access_token, refresh_token)
        # simplistic heuristic for scheduling: start now
        now = datetime.datetime.utcnow()
        duration = parsed_data.get("schedule_minutes", 30)
        calendar_id = create_calendar_event(cal_srv, parsed_data.get("title", "Task block"), now, duration)
        
    # 3. Create DB Models using Beanie (skip if DB not available)
    try:
        new_task = Task(
            user_id="default_user",
            title=parsed_data.get("title", "New Task"), 
            original_prompt=user_input, 
            calendar_event_id=calendar_id, 
            drive_doc_link=doc_link
        )
        await new_task.insert()
        
        for st in parsed_data.get("subtasks", []):
            new_subtask = Subtask(
                task_id=str(new_task.id),
                title=st.get("title"),
                reward_value=st.get("reward_value", 10)
            )
            await new_subtask.insert()
    except Exception:
        pass  # DB not available, skip persistence
    
    return {
        "status": "success",
        "parsed_plan": parsed_data,
        "google_doc": doc_link,
        "calendar_event_id": calendar_id
    }
