"""
Calendar Sync Service — Manages Google Calendar events for parent tasks.

Creates one calendar event per parent task (not per subtask).
Handles fixed deadlines vs flexible scheduling.
Updates event descriptions as subtasks are completed.
"""
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Tuple
from zoneinfo import ZoneInfo

from services.google_service import (
    get_calendar_service, fetch_events, create_calendar_event,
    update_calendar_event, delete_calendar_event, format_events_for_context,
)
from services.scheduler_service import (
    get_free_slots, urgency_score, apply_working_hours, assign_slots,
)


# ─── Subtask Checklist Formatting ──────────────────────────────────────

def _build_event_description(subtasks: List[Dict], task_prompt: str = "") -> str:
    """Build a calendar event description with a subtask checklist."""
    lines = []
    if task_prompt:
        lines.append(f"📝 {task_prompt}")
        lines.append("")

    lines.append("Subtasks:")
    for st in subtasks:
        check = "✅" if st.get("completed") else "☐"
        title = st.get("title", "Untitled")
        mins = st.get("estimated_minutes", 15)
        lines.append(f"  {check} {title} ({mins} min)")

        # Include steps under each subtask
        for step in st.get("steps", []):
            lines.append(f"      • {step}")

    lines.append("")
    lines.append("— Managed by Unstuck 🧠")
    return "\n".join(lines)


# ─── Time Preference Mapping ──────────────────────────────────────────

PREFERRED_TIME_RANGES = {
    "morning": (8, 12),    # 8am–12pm
    "afternoon": (12, 17),  # 12pm–5pm
    "evening": (17, 21),    # 5pm–9pm
}


def _filter_slots_by_preference(
    free_slots: List[Tuple[datetime, datetime]],
    preferred_time: Optional[str],
) -> List[Tuple[datetime, datetime]]:
    """Filter free slots to match user's preferred time of day, if specified."""
    if not preferred_time or preferred_time not in PREFERRED_TIME_RANGES:
        return free_slots

    start_hour, end_hour = PREFERRED_TIME_RANGES[preferred_time]
    filtered = []
    for slot_start, slot_end in free_slots:
        # Clip slot to preferred range
        pref_start = slot_start.replace(hour=max(slot_start.hour, start_hour), minute=0, second=0)
        pref_end = slot_end.replace(hour=min(slot_end.hour, end_hour), minute=0, second=0)

        if pref_start < slot_start:
            pref_start = slot_start
        if pref_end > slot_end:
            pref_end = slot_end

        if pref_start < pref_end:
            filtered.append((pref_start, pref_end))

    # Fall back to all slots if no preferred slots available
    return filtered if filtered else free_slots


def _find_slot_for_duration(
    free_slots: List[Tuple[datetime, datetime]],
    duration_minutes: int,
) -> Optional[Tuple[datetime, datetime]]:
    """Find the first free slot that can fit the given duration."""
    needed = timedelta(minutes=duration_minutes)
    for slot_start, slot_end in free_slots:
        available = slot_end - slot_start
        if available >= needed:
            return (slot_start, slot_start + needed)
    return None


def _find_slot_before_deadline(
    free_slots: List[Tuple[datetime, datetime]],
    duration_minutes: int,
    deadline: datetime,
) -> Optional[Tuple[datetime, datetime]]:
    """Find the latest free slot before the deadline that fits the duration.
    Prefers scheduling closer to the deadline (backfill strategy for ADHD —
    reduces the pressure of scheduling too far ahead).
    """
    needed = timedelta(minutes=duration_minutes)
    # Reverse iteration to find the LATEST slot before deadline
    valid_slots = []
    for slot_start, slot_end in free_slots:
        # Clip to deadline
        effective_end = min(slot_end, deadline)
        if effective_end - slot_start >= needed:
            valid_slots.append((slot_start, effective_end))

    if not valid_slots:
        return None

    # Pick the last valid slot (closest to deadline)
    slot_start, slot_end = valid_slots[-1]
    event_start = slot_end - needed  # schedule at the end of the slot
    return (event_start, event_start + needed)


# ─── Main Calendar Sync Functions ─────────────────────────────────────

async def sync_task_to_calendar(
    user,
    task,
    parsed_data: Dict,
    subtask_docs: List[Dict],
) -> Optional[str]:
    """
    Create or update a Google Calendar event for a parent task.
    
    Returns the calendar_event_id if successful, None otherwise.
    """
    if not user or not user.access_token or not user.refresh_token:
        return None

    try:
        cal_service = get_calendar_service(user.access_token, user.refresh_token)

        # Use the user's local timezone for all scheduling
        user_tz_str = getattr(user, 'timezone', None) or "America/Chicago"
        user_tz = ZoneInfo(user_tz_str)

        # "now" in the user's local timezone (naive for internal comparisons)
        now = datetime.now(user_tz).replace(tzinfo=None)
        look_ahead_end = now + timedelta(days=7)  # Look a week ahead
        existing_events = fetch_events(cal_service, now, look_ahead_end, user_timezone=user_tz_str)
        free_slots = get_free_slots(existing_events, now, look_ahead_end, user_timezone=user_tz_str)

        start_immediately = parsed_data.get("start_immediately", False)
        explicit_start_time = parsed_data.get("explicit_start_time")  # e.g. "05:00"

        # Apply time preference filter (skipped for start_immediately)
        preferred_time = None if start_immediately else parsed_data.get("preferred_time")
        filtered_slots = _filter_slots_by_preference(free_slots, preferred_time)

        duration = task.estimated_minutes or 30
        deadline = task.deadline
        scheduled_start = None
        scheduled_end = None

        # ── Schedule based on how the user expressed timing ────────────
        if start_immediately:
            # User said "now" — anchor to current local time, no preference filter
            result = _find_slot_for_duration(free_slots, duration)
            if result:
                scheduled_start, scheduled_end = result

        elif explicit_start_time:
            # User said "do it at 5am" — find slot AT that time, not before it
            try:
                target_hour, target_minute = map(int, explicit_start_time.split(":"))
                target_dt = now.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
                if target_dt < now:
                    target_dt += timedelta(days=1)  # push to next occurrence
                # Find the first free slot containing the target start time
                for slot_start, slot_end in free_slots:
                    if slot_start <= target_dt and slot_end >= target_dt + timedelta(minutes=duration):
                        scheduled_start = target_dt
                        scheduled_end = target_dt + timedelta(minutes=duration)
                        break
                # Fallback: first slot on or after target time
                if not scheduled_start:
                    for slot_start, slot_end in free_slots:
                        if slot_end >= target_dt + timedelta(minutes=duration):
                            scheduled_start = max(slot_start, target_dt)
                            scheduled_end = scheduled_start + timedelta(minutes=duration)
                            break
            except (ValueError, AttributeError):
                pass

        elif deadline and task.is_fixed_deadline:
            # Fixed deadline: schedule working backwards from deadline
            result = _find_slot_before_deadline(filtered_slots, duration, deadline)
            if result:
                scheduled_start, scheduled_end = result
            else:
                result = _find_slot_before_deadline(free_slots, duration, deadline)
                if result:
                    scheduled_start, scheduled_end = result

        elif deadline and not task.is_fixed_deadline:
            # Soft deadline: find earliest slot
            result = _find_slot_for_duration(filtered_slots, duration)
            if result:
                scheduled_start, scheduled_end = result
            else:
                result = _find_slot_for_duration(free_slots, duration)
                if result:
                    scheduled_start, scheduled_end = result

        else:
            # No deadline, no explicit time: find earliest slot matching preference
            result = _find_slot_for_duration(filtered_slots, duration)
            if result:
                scheduled_start, scheduled_end = result
            else:
                result = _find_slot_for_duration(free_slots, duration)
                if result:
                    scheduled_start, scheduled_end = result

        if not scheduled_start or not scheduled_end:
            print("⚠️  No available slot found for task")
            return None

        # ── Build event description with subtask checklist ────────────
        description = _build_event_description(
            subtask_docs,
            task_prompt=task.original_prompt,
        )

        # ── Determine calendar color ──────────────────────────────────
        color_map = {"high": "11", "medium": "9", "low": "8"}  # red, lavender, graphite
        color_id = color_map.get(task.priority, "9")

        # ── Create or update the event ────────────────────────────────
        if task.calendar_event_id:
            # Update existing event
            event_id = update_calendar_event(
                cal_service,
                event_id=task.calendar_event_id,
                title=f"📋 {task.title}",
                start_time=scheduled_start,
                end_time=scheduled_end,
                description=description,
                timezone=user_tz_str,
            )
        else:
            # Create new event
            event_id = create_calendar_event(
                cal_service,
                title=f"📋 {task.title}",
                start_time=scheduled_start,
                duration_minutes=duration,
                description=description,
                color_id=color_id,
                timezone=user_tz_str,
            )

        # ── Update task with calendar info ────────────────────────────
        task.calendar_event_id = event_id
        task.scheduled_start = scheduled_start
        task.scheduled_end = scheduled_end
        await task.save()

        print(f"📅 Calendar event {'updated' if task.calendar_event_id else 'created'}: "
              f"{task.title} @ {scheduled_start.strftime('%Y-%m-%d %H:%M')}")
        return event_id

    except Exception as e:
        print(f"⚠️  Calendar sync failed: {e}")
        return None


async def update_task_calendar_event(user, task, subtask_docs: List[Dict]) -> bool:
    """
    Update the calendar event description to reflect current subtask completion status.
    Called when a subtask is checked off.
    """
    if not task.calendar_event_id or not user or not user.access_token:
        return False

    try:
        cal_service = get_calendar_service(user.access_token, user.refresh_token)
        description = _build_event_description(subtask_docs, task_prompt=task.original_prompt)

        update_calendar_event(
            cal_service,
            event_id=task.calendar_event_id,
            description=description,
        )
        print(f"📅 Updated calendar event for: {task.title}")
        return True
    except Exception as e:
        print(f"⚠️  Calendar update failed: {e}")
        return False


async def remove_task_calendar_event(user, task) -> bool:
    """
    Delete the calendar event when a task is fully completed.
    """
    if not task.calendar_event_id or not user or not user.access_token:
        return False

    try:
        cal_service = get_calendar_service(user.access_token, user.refresh_token)
        delete_calendar_event(cal_service, task.calendar_event_id)

        task.calendar_event_id = None
        task.scheduled_start = None
        task.scheduled_end = None
        await task.save()

        print(f"📅 Removed calendar event for completed task: {task.title}")
        return True
    except Exception as e:
        print(f"⚠️  Calendar deletion failed: {e}")
        return False


# ─── Global Rebalancer (PW-EDF) ───────────────────────────────────────

async def rebalance_schedule(user, user_tz_str: str) -> dict:
    """
    Priority-Weighted Earliest Deadline First rebalancer.

    Re-assigns ALL pending AI-managed tasks in urgency order:
      1. Fetches pending tasks from DB
      2. Fetches Google Calendar events; treats non-AI events as hard obstacles
      3. Applies working hours (6 AM – midnight) to free slots
      4. Separates pinned (is_fixed_deadline) tasks from fluid tasks
      5. Sorts fluid tasks by urgency_score descending
      6. Packs tasks into slots greedily
      7. Batch-updates Google Calendar events

    Returns dict with displaced_count, overflow list, and warning strings.
    """
    from models import Task

    if not user or not user.access_token or not user.refresh_token:
        return {"displaced_count": 0, "overflow": [], "warnings": ["No Google auth"]}

    try:
        cal_service = get_calendar_service(user.access_token, user.refresh_token)
    except Exception as e:
        return {"displaced_count": 0, "overflow": [], "warnings": [f"Calendar auth failed: {e}"]}

    user_tz = ZoneInfo(user_tz_str)
    now = datetime.now(user_tz).replace(tzinfo=None)
    look_ahead = now + timedelta(days=7)

    # ── 1. Load all pending AI-managed tasks ────────────────────────
    try:
        all_pending = await Task.find(
            {"user_id": user.email, "status": "pending", "is_ai_managed": True}
        ).to_list()
    except Exception as e:
        print(f"⚠️  DB fetch failed in rebalance: {e}")
        return {"displaced_count": 0, "overflow": [], "warnings": [str(e)]}

    if not all_pending:
        return {"displaced_count": 0, "overflow": [], "warnings": []}

    # ── 2. Fetch hard calendar obstacles ────────────────────────────
    try:
        all_cal_events = fetch_events(cal_service, now, look_ahead, user_timezone=user_tz_str)
    except Exception as e:
        print(f"⚠️  Calendar fetch failed in rebalance: {e}")
        return {"displaced_count": 0, "overflow": [], "warnings": [str(e)]}

    # Events managed by us are "soft" — exclude them from obstacles
    ai_event_ids = {t.calendar_event_id for t in all_pending if t.calendar_event_id}
    hard_events = [e for e in all_cal_events if e.get("id") not in ai_event_ids]

    # ── 3. Build and constrain free slots ───────────────────────────
    free_slots = get_free_slots(hard_events, now, look_ahead, user_timezone=user_tz_str)
    free_slots = apply_working_hours(free_slots)  # 6 AM – midnight only

    if not free_slots:
        titles = [t.title for t in all_pending]
        return {"displaced_count": 0, "overflow": titles, "warnings": ["No free slots in working hours"]}

    # ── 4. Score and sort tasks ─────────────────────────────────────────
    # assign_slots internally handles pinning explicit_start_time and sorting the rest
    deviation = getattr(user, "time_deviation_ratio", 1.5)
    all_assignments = assign_slots(all_pending, free_slots, deviation, now)

    # ── 5. Sync to Google Calendar and DB ───────────────────────────────
    displaced_count = 0
    overflow_tasks = []
    warnings = []

    color_map = {"high": "11", "medium": "9", "low": "8"}

    for assignment in all_assignments:
        task = assignment["task"]

        if assignment["overflow"]:
            overflow_tasks.append(task.title)
            warnings.append(f"Could not schedule '{task.title}' — no available slot")
            print(f"⚠️  Overflow: {task.title}")
            continue

        new_start = assignment["start"]
        new_end = assignment["end"]
        was_displaced = (task.scheduled_start != new_start or task.scheduled_end != new_end)

        try:
            if task.calendar_event_id:
                update_calendar_event(
                    cal_service,
                    event_id=task.calendar_event_id,
                    title=f"📋 {task.title}",
                    start_time=new_start,
                    end_time=new_end,
                    timezone=user_tz_str,
                )
            else:
                duration_min = int((new_end - new_start).total_seconds() / 60)
                subtask_desc = f"📝 {task.original_prompt}\n— Managed by Unstuck 🧠"
                event_id = create_calendar_event(
                    cal_service,
                    title=f"📋 {task.title}",
                    start_time=new_start,
                    duration_minutes=duration_min,
                    description=subtask_desc,
                    color_id=color_map.get(task.priority, "9"),
                    timezone=user_tz_str,
                )
                task.calendar_event_id = event_id

            task.scheduled_start = new_start
            task.scheduled_end = new_end
            await task.save()

            if was_displaced:
                displaced_count += 1
                print(f"📅 Rebalanced '{task.title}' → {new_start.strftime('%Y-%m-%d %H:%M')}")

        except Exception as e:
            msg = f"Calendar update failed for '{task.title}': {e}"
            print(f"⚠️  {msg}")
            warnings.append(msg)

    return {
        "displaced_count": displaced_count,
        "overflow": overflow_tasks,
        "warnings": warnings,
    }
