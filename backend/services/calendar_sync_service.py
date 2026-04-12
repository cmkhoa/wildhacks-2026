"""
Calendar Sync Service — Manages Google Calendar events for parent tasks.

Creates one calendar event per parent task (not per subtask).
Handles fixed deadlines vs flexible scheduling.
Updates event descriptions as subtasks are completed.
"""
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Tuple

from services.google_service import (
    get_calendar_service, fetch_events, create_calendar_event,
    update_calendar_event, delete_calendar_event, format_events_for_context,
)
from services.scheduler_service import get_free_slots


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
    lines.append("— Managed by Timi 🧠")
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

        # Fetch existing events to find free times
        now = datetime.utcnow()
        look_ahead_end = now + timedelta(days=7)  # Look a week ahead
        existing_events = fetch_events(cal_service, now, look_ahead_end)
        free_slots = get_free_slots(existing_events, now, look_ahead_end)

        # Apply time preference filter
        preferred_time = parsed_data.get("preferred_time")
        filtered_slots = _filter_slots_by_preference(free_slots, preferred_time)

        duration = task.estimated_minutes or 30
        deadline = task.deadline
        scheduled_start = None
        scheduled_end = None

        # ── Schedule based on deadline type ───────────────────────────
        if deadline and task.is_fixed_deadline:
            # Fixed deadline: schedule working backwards from deadline
            result = _find_slot_before_deadline(filtered_slots, duration, deadline)
            if result:
                scheduled_start, scheduled_end = result
            else:
                # Fallback: try all slots (ignore preference)
                result = _find_slot_before_deadline(free_slots, duration, deadline)
                if result:
                    scheduled_start, scheduled_end = result
        else:
            # Flexible: find earliest available slot
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
