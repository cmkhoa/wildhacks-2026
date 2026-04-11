"""
Tasks Router — The full agentic pipeline with ADHD core mechanics.

Core Mechanics:
1. Honest Estimator — AI responds with adjusted time based on user history
2. Auto-Buffering — transition buffers injected between context switches
3. Ripple Effect — "+15 mins" ripples all non-fixed tasks forward
"""
from fastapi import APIRouter, HTTPException, Body
from typing import Dict, Any, List
from datetime import datetime, timedelta

from services.agent_service import parse_user_task
from services.google_service import (
    get_calendar_service, get_drive_service, get_docs_service,
    fetch_events, create_calendar_event, update_calendar_event,
    create_templated_doc, format_events_for_context,
)
from services.scheduler_service import (
    get_free_slots, schedule_subtasks, honest_estimate,
    ripple_tasks, update_deviation_ratio,
)
from models import User, Task, Subtask

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


async def _get_user(email: str) -> User:
    """Fetch user from DB or raise."""
    user = await User.find_one(User.email == email)
    if not user:
        raise HTTPException(status_code=401, detail="User not found. Please log in.")
    return user


# ─── POST /process — Full agentic pipeline ────────────────────────────

@router.post("/process")
async def process_task(payload: Dict[str, Any] = Body(...)):
    """
    Full pipeline: parse → honest estimate → schedule with buffers → create resources → persist.
    """
    user_input = payload.get("user_input")
    email = payload.get("email")

    if not user_input:
        raise HTTPException(status_code=400, detail="Missing user_input")

    # ── 1. Resolve user ───────────────────────────────────────────────
    user = None
    has_google = False
    existing_events = []
    events_context = "No calendar access."

    if email:
        try:
            user = await _get_user(email)
            has_google = bool(user.access_token and user.refresh_token)
        except HTTPException:
            pass

    # ── 2. Fetch existing calendar events ─────────────────────────────
    if has_google:
        try:
            cal_service = get_calendar_service(user.access_token, user.refresh_token)
            now = datetime.utcnow()
            eod = now.replace(hour=23, minute=59, second=59)
            existing_events = fetch_events(cal_service, now, eod)
            events_context = format_events_for_context(existing_events)
        except Exception as e:
            print(f"⚠️  Calendar fetch failed: {e}")

    # ── 3. Parse with Gemini ──────────────────────────────────────────
    deviation = user.time_deviation_ratio if user else 1.5
    parsed_data = parse_user_task(
        user_input=user_input,
        deviation_ratio=deviation,
        current_time=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        existing_events=events_context,
    )

    # ── 4. Honest Estimator — adjust each subtask's time ──────────────
    estimation_messages = []
    for st in parsed_data.get("subtasks", []):
        est = honest_estimate(
            user_estimate_minutes=st.get("estimated_minutes", 20),
            deviation_ratio=deviation,
            task_title=st.get("title", ""),
        )
        st["adjusted_minutes"] = est["adjusted_estimate"]
        estimation_messages.append(est["message"])

    # Overall task estimate
    total_est = honest_estimate(
        user_estimate_minutes=parsed_data.get("estimated_minutes", 30),
        deviation_ratio=deviation,
        task_title=parsed_data.get("title", "Task"),
    )

    # ── 5. Schedule with auto-buffers ─────────────────────────────────
    now = datetime.utcnow()
    day_end = now.replace(hour=23, minute=59, second=59)
    free_slots = get_free_slots(existing_events, now, day_end)
    schedule_ops = schedule_subtasks(
        parsed_data.get("subtasks", []),
        free_slots,
        deviation,
        existing_events=existing_events,
    )

    # ── 6. Create Google Calendar events + Drive docs ─────────────────
    created_events = []
    created_docs = []

    if has_google:
        try:
            cal_svc = get_calendar_service(user.access_token, user.refresh_token)
            drive_svc = get_drive_service(user.access_token, user.refresh_token)
            docs_svc = get_docs_service(user.access_token, user.refresh_token)

            for op in schedule_ops:
                if op.get("overflow"):
                    continue
                steps_text = "\n".join(f"☐ {s}" for s in op.get("steps", []))
                desc = f"Steps:\n{steps_text}" if steps_text else ""
                if op.get("buffer_minutes"):
                    desc = f"⏱ {op['buffer_minutes']}min transition buffer before this task\n\n{desc}"

                event_id = create_calendar_event(
                    cal_svc,
                    title=op["subtask_title"],
                    start_time=datetime.fromisoformat(op["start"]),
                    duration_minutes=op["duration_minutes"],
                    description=desc,
                    color_id="9",
                )
                op["calendar_event_id"] = event_id
                created_events.append(event_id)

            for st in parsed_data.get("subtasks", []):
                if st.get("needs_doc") and st.get("doc_title"):
                    try:
                        doc_url = create_templated_doc(
                            drive_svc, docs_svc,
                            title=st["doc_title"],
                            outline_content=st.get("doc_outline", ""),
                        )
                        st["drive_doc_link"] = doc_url
                        created_docs.append(doc_url)
                    except Exception as e:
                        print(f"⚠️  Doc creation failed: {e}")
        except Exception as e:
            print(f"⚠️  Google API failed: {e}")

    # ── 7. Persist to MongoDB ─────────────────────────────────────────
    task_id = None
    try:
        new_task = Task(
            user_id=email or "anonymous",
            title=parsed_data.get("title", "New Task"),
            original_prompt=user_input,
            priority=parsed_data.get("priority", "medium"),
            estimated_minutes=parsed_data.get("estimated_minutes", 30),
        )
        await new_task.insert()
        task_id = str(new_task.id)

        for i, st in enumerate(parsed_data.get("subtasks", [])):
            cal_id = None
            if i < len(schedule_ops) and not schedule_ops[i].get("overflow"):
                cal_id = schedule_ops[i].get("calendar_event_id")
            new_subtask = Subtask(
                task_id=task_id,
                title=st.get("title", f"Subtask {i+1}"),
                steps=st.get("steps", []),
                estimated_minutes=st.get("estimated_minutes", 15),
                order=i,
                reward_value=max(5, st.get("estimated_minutes", 15) // 3),
                calendar_event_id=cal_id,
            )
            await new_subtask.insert()
    except Exception as e:
        print(f"⚠️  DB persistence skipped: {e}")

    # ── 8. Return full plan with honest estimates ─────────────────────
    return {
        "status": "success",
        "task_id": task_id,
        "honest_estimate": total_est,
        "estimation_messages": estimation_messages,
        "parsed_plan": parsed_data,
        "schedule": schedule_ops,
        "created_events": created_events,
        "created_docs": created_docs,
    }


# ─── POST /ripple — The Ripple Effect ─────────────────────────────────

@router.post("/ripple")
async def ripple_schedule(payload: Dict[str, Any] = Body(...)):
    """
    The Ripple Effect: user hits "+15 mins" on a task. All subsequent
    non-fixed tasks shift forward. Updates Google Calendar events too.
    """
    schedule_ops = payload.get("schedule", [])
    from_index = payload.get("from_index", 0)
    extra_minutes = payload.get("extra_minutes", 15)
    email = payload.get("email")

    if not schedule_ops:
        raise HTTPException(status_code=400, detail="No schedule to ripple")

    # Apply ripple
    updated_ops = ripple_tasks(schedule_ops, from_index, extra_minutes)

    # Update Google Calendar events for rippled tasks
    if email:
        try:
            user = await _get_user(email)
            if user.access_token and user.refresh_token:
                cal_svc = get_calendar_service(user.access_token, user.refresh_token)
                for op in updated_ops:
                    if op.get("rippled") and op.get("calendar_event_id") and op.get("start"):
                        try:
                            update_calendar_event(
                                cal_svc,
                                event_id=op["calendar_event_id"],
                                start_time=datetime.fromisoformat(op["start"]),
                                end_time=datetime.fromisoformat(op["end"]),
                            )
                        except Exception as e:
                            print(f"⚠️  Calendar update failed for {op['subtask_title']}: {e}")
        except Exception:
            pass

    rippled_count = sum(1 for op in updated_ops if op.get("rippled"))
    return {
        "status": "success",
        "updated_schedule": updated_ops,
        "rippled_count": rippled_count,
        "message": f"⏰ Pushed {rippled_count} tasks forward by {extra_minutes} minutes.",
    }


# ─── POST /complete — Mark task done + update deviation ─────────────

@router.post("/complete")
async def complete_task(payload: Dict[str, Any] = Body(...)):
    """Record actual time and update deviation ratio."""
    task_id = payload.get("task_id")
    actual_minutes = payload.get("actual_minutes")
    email = payload.get("email")

    if not task_id or actual_minutes is None:
        raise HTTPException(status_code=400, detail="Missing task_id or actual_minutes")

    try:
        task = await Task.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        task.status = "completed"
        task.actual_minutes = actual_minutes
        task.completed_at = datetime.utcnow()
        await task.save()

        if email:
            user = await User.find_one(User.email == email)
            if user and task.estimated_minutes > 0:
                new_ratio, new_samples = update_deviation_ratio(
                    user.time_deviation_ratio, user.deviation_samples,
                    task.estimated_minutes, actual_minutes,
                )
                user.time_deviation_ratio = new_ratio
                user.deviation_samples = new_samples
                await user.save()
                return {
                    "status": "success",
                    "new_deviation_ratio": new_ratio,
                    "message": f"✅ Done! Your time accuracy ratio updated to {new_ratio}x."
                }
        return {"status": "success", "message": "✅ Task completed!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── GET / — List user tasks ──────────────────────────────────────────

@router.get("/")
async def list_tasks(email: str):
    """List all tasks with subtasks for a user."""
    try:
        tasks = await Task.find(Task.user_id == email).sort("-created_at").to_list()
        result = []
        for task in tasks:
            subtasks = await Subtask.find(Subtask.task_id == str(task.id)).sort("order").to_list()
            result.append({
                "id": str(task.id),
                "title": task.title,
                "status": task.status,
                "priority": task.priority,
                "estimated_minutes": task.estimated_minutes,
                "actual_minutes": task.actual_minutes,
                "created_at": task.created_at.isoformat() if task.created_at else None,
                "subtasks": [{
                    "id": str(st.id),
                    "title": st.title,
                    "steps": st.steps,
                    "estimated_minutes": st.estimated_minutes,
                    "completed": st.completed,
                    "reward_value": st.reward_value,
                    "calendar_event_id": st.calendar_event_id,
                } for st in subtasks],
            })
        return {"tasks": result}
    except Exception as e:
        return {"tasks": [], "error": str(e)}
