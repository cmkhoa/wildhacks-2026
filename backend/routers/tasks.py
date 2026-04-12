"""
Tasks Router — The full agentic pipeline with ADHD core mechanics.

Core Mechanics:
1. Honest Estimator — AI responds with adjusted time based on user history
2. Auto-Buffering — transition buffers injected between context switches
3. Ripple Effect — "+15 mins" ripples all non-fixed tasks forward
4. Calendar Sync — One calendar event per parent task
"""
from fastapi import APIRouter, HTTPException, Body
from typing import Dict, Any, List
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

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
from services.calendar_sync_service import (
    sync_task_to_calendar, update_task_calendar_event,
    remove_task_calendar_event, rebalance_schedule,
)
from models import User, Task, Subtask

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


async def _get_user(email: str) -> User:
    """Fetch user from DB or raise."""
    user = await User.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=401, detail="User not found. Please log in.")
    return user


# ─── POST /process — Full agentic pipeline ────────────────────────────

@router.post("/process")
async def process_task(payload: Dict[str, Any] = Body(...)):
    """
    Full pipeline: parse → clarify → honest estimate → persist → calendar sync.
    """
    user_input = payload.get("user_input")
    email = payload.get("email")
    chat_history_raw = payload.get("chat_history", [])

    if not user_input:
        raise HTTPException(status_code=400, detail="Missing user_input")

    # Format chat history for context
    chat_history_str = "No prior messages."
    if chat_history_raw and isinstance(chat_history_raw, list):
        chat_history_str = "\n".join([f"{msg.get('role', 'unknown')}: {msg.get('text', '')}" for msg in chat_history_raw])

    # ── 1. Resolve user ───────────────────────────────────────────────
    user = None
    has_google = False
    existing_events = []
    events_context = "No calendar access."

    if email:
        try:
            user = await _get_user(email)
            has_google = bool(user.access_token and user.refresh_token)
        except Exception:
            # HTTPException (user not found) or Beanie/MongoDB errors — continue without user
            pass

    # ── 2. Fetch existing calendar events (look a week ahead) ─────────
    user_tz_str = (user.timezone if user else None) or "America/Chicago"
    user_tz = ZoneInfo(user_tz_str)
    now_local = datetime.now(user_tz)  # timezone-aware local time
    now_local_naive = now_local.replace(tzinfo=None)  # naive for internal comparisons

    if has_google:
        try:
            cal_service = get_calendar_service(user.access_token, user.refresh_token)
            look_ahead = now_local_naive + timedelta(days=7)
            existing_events = fetch_events(cal_service, now_local_naive, look_ahead, user_timezone=user_tz_str)
            events_context = format_events_for_context(existing_events)
        except Exception as e:
            print(f"⚠️  Calendar fetch failed: {e}")

    # ── 3. Parse with Gemini ──────────────────────────────────────────
    deviation = user.time_deviation_ratio if user else 1.5
    parsed_container = parse_user_task(
        user_input=user_input,
        deviation_ratio=deviation,
        current_time=now_local.strftime("%Y-%m-%d %H:%M %Z"),  # local time with tz name
        existing_events=events_context,
        user_timezone=user_tz_str,
        chat_history=chat_history_str,
    )

    reply_text = parsed_container.get("reply", "Got it. Let's start with that.")
    should_create_task = parsed_container.get("should_create_task", False)
    parsed_data = parsed_container.get("task")

    if not should_create_task or not parsed_data:
        return {
            "status": "success",
            "reply": reply_text,
            "should_create_task": False,
        }

    # ── 3b. Handle clarification requests from LLM ───────────────────
    clarification = parsed_data.get("needs_clarification")
    if clarification:
        return {
            "status": "needs_clarification",
            "question": clarification,
            "reply": reply_text,
            "parsed_plan": parsed_data,
        }

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

    # ── 5. Parse deadline from LLM response ───────────────────────────
    deadline = None
    is_fixed_deadline = parsed_data.get("is_fixed_deadline", False)
    deadline_str = parsed_data.get("deadline")
    if deadline_str:
        try:
            deadline = datetime.fromisoformat(deadline_str)
        except (ValueError, TypeError):
            print(f"⚠️  Could not parse deadline: {deadline_str}")

    # ── 6. Create Google Drive docs and Gmail drafts if needed ────────
    created_docs = []
    created_drafts = []
    if has_google:
        from services.google_service import get_drive_service, get_docs_service, get_gmail_service, create_email_draft
        try:
            drive_svc = get_drive_service(user.access_token, user.refresh_token)
            docs_svc = get_docs_service(user.access_token, user.refresh_token)
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
                
                if st.get("needs_email") and st.get("email_subject"):
                    try:
                        gmail_svc = get_gmail_service(user.access_token, user.refresh_token)
                        draft_url = create_email_draft(
                            gmail_svc,
                            subject=st.get("email_subject", "New Email"),
                            body=st.get("email_body", ""),
                            to=st.get("email_recipient")
                        )
                        st["gmail_draft_link"] = draft_url
                        created_drafts.append(draft_url)
                    except Exception as e:
                        print(f"⚠️  Draft creation failed: {e}")
        except Exception as e:
            print(f"⚠️  Google Drive API failed: {e}")

    # ── 7. Persist to MongoDB ─────────────────────────────────────────
    task_id = None
    new_task = None
    subtask_docs = []
    try:
        new_task = Task(
            user_id=email or "anonymous",
            title=parsed_data.get("title", "New Task"),
            original_prompt=user_input,
            priority=parsed_data.get("priority", "medium"),
            estimated_minutes=parsed_data.get("estimated_minutes", 30),
            deadline=deadline,
            is_fixed_deadline=is_fixed_deadline,
            explicit_start_time=parsed_data.get("explicit_start_time"),
            start_immediately=parsed_data.get("start_immediately", False),
            drive_doc_link=created_docs[0] if created_docs else None,
            gmail_draft_link=created_drafts[0] if created_drafts else None,
        )
        await new_task.insert()
        task_id = str(new_task.id)

        for i, st in enumerate(parsed_data.get("subtasks", [])):
            new_subtask = Subtask(
                task_id=task_id,
                title=st.get("title", f"Subtask {i+1}"),
                steps=st.get("steps", []),
                estimated_minutes=st.get("estimated_minutes", 15),
                order=i,
                reward_value=max(5, st.get("estimated_minutes", 15) // 3),
            )
            await new_subtask.insert()
            subtask_docs.append({
                "title": new_subtask.title,
                "estimated_minutes": new_subtask.estimated_minutes,
                "steps": new_subtask.steps,
                "completed": False,
            })
    except Exception as e:
        print(f"⚠️  DB persistence skipped: {e}")

    # ── 8. Rebalance full schedule (PW-EDF) ───────────────────────────
    rebalance_result = {"displaced_count": 0, "overflow": [], "warnings": []}
    if has_google and user:
        try:
            rebalance_result = await rebalance_schedule(user, user_tz_str)
        except Exception as e:
            print(f"⚠️  Rebalance failed: {e}")

    # ── 9. Return full plan with honest estimates ─────────────────────
    return {
        "status": "success",
        "reply": reply_text,
        "should_create_task": True,
        "task_id": task_id,
        "honest_estimate": total_est,
        "estimation_messages": estimation_messages,
        "parsed_plan": parsed_data,
        "created_docs": created_docs,
        "created_drafts": created_drafts,
        "rebalance": {
            "displaced_count": rebalance_result.get("displaced_count", 0),
            "overflow": rebalance_result.get("overflow", []),
            "warnings": rebalance_result.get("warnings", []),
        },
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


# ─── POST /start — Mark task as started ───────────────────────────────

@router.post("/start")
async def start_task(payload: Dict[str, Any] = Body(...)):
    """Mark a task as started to track if user opened it before failing."""
    task_id = payload.get("task_id")
    if not task_id:
        raise HTTPException(status_code=400, detail="Missing task_id")
    try:
        task = await Task.get(task_id)
        if task and not task.started_at:
            task.started_at = datetime.utcnow()
            task.status = "in_progress"
            await task.save()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── POST /complete — Mark task done + update deviation ─────────────

@router.post("/complete")
async def complete_task(payload: Dict[str, Any] = Body(...)):
    """Record actual time, update deviation ratio, and remove calendar event."""
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

        # Remove calendar event for completed task
        if email:
            user = await User.find_one({"email": email})
            if user:
                await remove_task_calendar_event(user, task)

                if task.estimated_minutes > 0:
                    new_ratio, new_samples = update_deviation_ratio(
                        user.time_deviation_ratio, user.deviation_samples,
                        task.estimated_minutes, actual_minutes,
                    )
                    user.time_deviation_ratio = new_ratio
                    user.deviation_samples = new_samples
                    
                # Gamification: Update Streaks
                user.current_streak += 1
                if user.current_streak > user.longest_streak:
                    user.longest_streak = user.current_streak
                    
                await user.save()
                
                if task.estimated_minutes > 0:
                    return {
                        "status": "success",
                        "new_deviation_ratio": user.time_deviation_ratio,
                        "current_streak": user.current_streak,
                        "message": f"✅ Done! Your time accuracy ratio updated to {user.time_deviation_ratio}x."
                    }
                return {"status": "success", "current_streak": user.current_streak, "message": "✅ Task completed! Streak increased."}
        return {"status": "success", "message": "✅ Task completed!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── POST /subtask/complete — Mark subtask done ─────────────

@router.post("/subtask/complete")
async def complete_subtask(payload: Dict[str, Any] = Body(...)):
    """Mark a subtask as done, update reward points, and refresh calendar event."""
    subtask_id = payload.get("subtask_id")
    email = payload.get("email")

    if not subtask_id:
        raise HTTPException(status_code=400, detail="Missing subtask_id")

    try:
        from bson import ObjectId
        st = await Subtask.get(ObjectId(subtask_id))
        if not st:
            raise HTTPException(status_code=404, detail="Subtask not found")

        st.completed = True
        await st.save()

        if email:
            user = await User.find_one({"email": email})
            if user:
                user.reward_points += 1  # Always 1 gem per subtask
                await user.save()

                # Update calendar event description to reflect completion
                try:
                    task = await Task.get(ObjectId(st.task_id))
                    if task and task.calendar_event_id:
                        all_subtasks = await Subtask.find({"task_id": st.task_id}).sort("order").to_list()
                        subtask_docs = [{
                            "title": s.title,
                            "estimated_minutes": s.estimated_minutes,
                            "steps": s.steps,
                            "completed": s.completed,
                        } for s in all_subtasks]
                        await update_task_calendar_event(user, task, subtask_docs)
                except Exception as e:
                    print(f"⚠️  Calendar update on subtask complete failed: {e}")

                return {"status": "success", "reward_points": user.reward_points}
                
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── GET / — List user tasks ──────────────────────────────────────────

@router.get("/")
async def list_tasks(email: str):
    """List all tasks with subtasks for a user and check for missed tasks."""
    try:
        user = await User.find_one({"email": email})
        now = datetime.utcnow()
        streak_broken = False
        
        tasks = await Task.find({"user_id": email}).sort("-created_at").to_list()
        result = []
        for task in tasks:
            # Check if this task is missed
            if task.status in ["pending", "in_progress"] and task.scheduled_end:
                # If scheduled_end has passed by more than a brief grace period (e.g. 5 mins)
                # Actually, simply passing scheduled_end is enough based on plan
                if now > task.scheduled_end and not task.completed_at:
                    task.status = "missed"
                    task.missed = True
                    if task.started_at:
                        task.opened_but_failed = True
                    await task.save()
                    if user and user.current_streak > 0:
                        user.previous_streak = user.current_streak
                        user.current_streak = 0
                        user.last_streak_broken_at = now
                        streak_broken = True
            
            subtasks = await Subtask.find({"task_id": str(task.id)}).sort("order").to_list()
            result.append({
                "id": str(task.id),
                "title": task.title,
                "status": task.status,
                "priority": task.priority,
                "estimated_minutes": task.estimated_minutes,
                "actual_minutes": task.actual_minutes,
                "deadline": task.deadline.isoformat() if task.deadline else None,
                "is_fixed_deadline": task.is_fixed_deadline,
                "scheduled_start": task.scheduled_start.isoformat() if task.scheduled_start else None,
                "scheduled_end": task.scheduled_end.isoformat() if task.scheduled_end else None,
                "calendar_event_id": task.calendar_event_id,
                "drive_doc_link": task.drive_doc_link,
                "gmail_draft_link": getattr(task, "gmail_draft_link", None),
                "created_at": task.created_at.isoformat() if task.created_at else None,
                "subtasks": [{
                    "id": str(st.id),
                    "title": st.title,
                    "steps": st.steps,
                    "estimated_minutes": st.estimated_minutes,
                    "completed": st.completed,
                    "reward_value": st.reward_value,
                } for st in subtasks],
            })
            
        if streak_broken and user:
            await user.save()

        return {"tasks": result}
    except Exception as e:
        return {"tasks": [], "error": str(e)}


# ─── POST /rebalance — Trigger global PW-EDF rebalance ─────────────────

@router.post("/rebalance")
async def trigger_rebalance(payload: Dict[str, Any] = Body(...)):
    """
    Explicitly trigger a global schedule rebalance for a user.
    Useful after completing a task or when the frontend needs to force-refresh.
    """
    email = payload.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Missing email")

    try:
        user = await _get_user(email)
    except HTTPException:
        raise

    user_tz_str = getattr(user, "timezone", None) or "America/Chicago"
    has_google = bool(user.access_token and user.refresh_token)

    if not has_google:
        return {"status": "skipped", "reason": "No Google auth"}

    try:
        result = await rebalance_schedule(user, user_tz_str)
        return {
            "status": "success",
            "displaced_count": result["displaced_count"],
            "overflow": result["overflow"],
            "warnings": result["warnings"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── POST /streaks/restore — Restore a broken streak ──────────────────

@router.post("/streaks/restore")
async def restore_streak(payload: Dict[str, Any] = Body(...)):
    """Deduct gems to restore a broken streak."""
    email = payload.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Missing email")

    try:
        user = await User.find_one({"email": email})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Check if there is a streak to restore
        if user.previous_streak <= 0 or user.current_streak > 0:
            return {"status": "error", "message": "No broken streak to restore."}

        # Find the last missed task to determine cost
        latest_missed_task = await Task.find(
            {"user_id": email, "missed": True}
        ).sort("-scheduled_end").first_or_none()

        # Default cost is 10
        cost = 10
        if latest_missed_task and latest_missed_task.opened_but_failed:
            cost = 5

        if user.reward_points < cost:
            return {"status": "error", "message": f"Not enough gems. Need {cost}."}

        # Restore
        user.reward_points -= cost
        user.current_streak = user.previous_streak
        user.previous_streak = 0
        user.last_streak_broken_at = None
        
        await user.save()
        return {
            "status": "success", 
            "current_streak": user.current_streak, 
            "reward_points": user.reward_points,
            "cost": cost
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
