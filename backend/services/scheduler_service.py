"""
Scheduler Service — The core agentic brain for ADHD calendar management.

Core Mechanics:
1. Honest Estimator — adjusts user time estimates based on historical deviation
2. Auto-Buffering — injects transition buffers between high-friction context switches
3. Ripple Effect — shifts all non-fixed tasks forward when one task overruns
"""
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple

# Tasks that are considered "high friction" context switches
HIGH_FRICTION_KEYWORDS = [
    "meeting", "zoom", "call", "standup", "interview", "presentation",
    "review", "coding", "debug", "write", "essay", "report", "exam",
]

TRANSITION_BUFFER_MINUTES = 10  # "ADHD Tax" padding


# ─── Honest Estimator ─────────────────────────────────────────────────

def honest_estimate(
    user_estimate_minutes: int,
    deviation_ratio: float,
    task_title: str = "",
) -> Dict:
    """
    The Honest Estimator: takes the user's gut estimate, applies their
    historical deviation ratio, and returns an adjusted + honest response.
    """
    adjusted = int(user_estimate_minutes * deviation_ratio)
    adjusted = max(10, min(adjusted, 240))  # clamp 10min–4hr

    honesty_message = ""
    if deviation_ratio > 1.2:
        diff = adjusted - user_estimate_minutes
        honesty_message = (
            f'Based on your history, "{task_title}" usually takes you '
            f"~{adjusted} minutes (you estimated {user_estimate_minutes}). "
            f"I'm blocking {adjusted} mins (+{diff} buffer). Sound good?"
        )
    elif deviation_ratio < 0.9:
        honesty_message = (
            f'You\'re actually faster than you think at "{task_title}"! '
            f"Estimate: {user_estimate_minutes} min, adjusted: {adjusted} min."
        )
    else:
        honesty_message = (
            f'Your estimate of {user_estimate_minutes} min for "{task_title}" '
            f"looks accurate. Locking it in!"
        )

    return {
        "original_estimate": user_estimate_minutes,
        "adjusted_estimate": adjusted,
        "deviation_ratio": deviation_ratio,
        "message": honesty_message,
    }


# ─── Auto-Buffering (ADHD Tax) ────────────────────────────────────────

def _is_high_friction(event_summary: str) -> bool:
    """Check if an event involves a high-friction context switch."""
    lower = event_summary.lower()
    return any(kw in lower for kw in HIGH_FRICTION_KEYWORDS)


def _needs_buffer(prev_event: Optional[Dict], next_task_title: str) -> bool:
    """
    Determines if a buffer is needed between the previous event and the next task.
    Buffer is needed when switching between high-friction activities.
    """
    if not prev_event:
        return False
    prev_title = prev_event.get("summary", "")
    # Buffer if either side is high-friction AND they're different types
    prev_hf = _is_high_friction(prev_title)
    next_hf = _is_high_friction(next_task_title)
    return prev_hf or next_hf


# ─── Free Slot Detection ──────────────────────────────────────────────

def get_free_slots(
    events: List[Dict],
    day_start: datetime,
    day_end: datetime,
) -> List[Tuple[datetime, datetime]]:
    """
    Given Google Calendar events and a day boundary,
    returns (start, end) free slot tuples.
    """
    busy = []
    for ev in events:
        start_raw = ev.get("start", {}).get("dateTime") or ev.get("start", {}).get("date")
        end_raw = ev.get("end", {}).get("dateTime") or ev.get("end", {}).get("date")
        if not start_raw or not end_raw:
            continue
        try:
            start = datetime.fromisoformat(start_raw.replace("Z", "+00:00")).replace(tzinfo=None)
            end = datetime.fromisoformat(end_raw.replace("Z", "+00:00")).replace(tzinfo=None)
            busy.append((start, end))
        except (ValueError, TypeError):
            continue

    busy.sort(key=lambda x: x[0])

    free_slots = []
    cursor = day_start

    for start, end in busy:
        if cursor < start:
            free_slots.append((cursor, start))
        cursor = max(cursor, end)

    if cursor < day_end:
        free_slots.append((cursor, day_end))

    return free_slots


def adjust_duration(estimated_minutes: int, deviation_ratio: float) -> int:
    """Apply the user's ADHD deviation ratio to get realistic duration."""
    adjusted = int(estimated_minutes * deviation_ratio)
    return max(10, min(adjusted, 180))


# ─── Smart Scheduling with Auto-Buffers ───────────────────────────────

def schedule_subtasks(
    subtasks: List[Dict],
    free_slots: List[Tuple[datetime, datetime]],
    deviation_ratio: float,
    existing_events: Optional[List[Dict]] = None,
) -> List[Dict]:
    """
    Assigns each subtask to the earliest available free slot.
    Injects ADHD transition buffers between high-friction context switches.
    """
    operations = []
    slot_idx = 0
    slot_cursor = free_slots[0][0] if free_slots else None
    prev_event = None

    # Build a quick lookup of what event preceded each free slot
    sorted_events = sorted(
        (existing_events or []),
        key=lambda e: e.get("end", {}).get("dateTime", ""),
    )

    for i, subtask in enumerate(subtasks):
        raw_minutes = subtask.get("estimated_minutes", 20)
        duration = adjust_duration(raw_minutes, deviation_ratio)
        needed = timedelta(minutes=duration)

        # Check if we need a transition buffer
        buffer_minutes = 0
        subtask_title = subtask.get("title", "")
        if _needs_buffer(prev_event, subtask_title):
            buffer_minutes = TRANSITION_BUFFER_MINUTES

        total_needed = needed + timedelta(minutes=buffer_minutes)

        scheduled = False
        while slot_idx < len(free_slots):
            slot_start, slot_end = free_slots[slot_idx]
            current_start = max(slot_cursor or slot_start, slot_start)
            available = slot_end - current_start

            if available >= total_needed:
                # Apply buffer first
                event_start = current_start + timedelta(minutes=buffer_minutes)
                event_end = event_start + needed

                operations.append({
                    "subtask_title": subtask_title,
                    "subtask_index": i,
                    "start": event_start.isoformat(),
                    "end": event_end.isoformat(),
                    "duration_minutes": duration,
                    "original_estimate": raw_minutes,
                    "adjusted_estimate": duration,
                    "buffer_minutes": buffer_minutes,
                    "steps": subtask.get("steps", []),
                })

                # Track for next buffer decision
                prev_event = {"summary": subtask_title}
                slot_cursor = event_end + timedelta(minutes=5)
                scheduled = True
                break
            else:
                slot_idx += 1
                slot_cursor = free_slots[slot_idx][0] if slot_idx < len(free_slots) else None

        if not scheduled:
            operations.append({
                "subtask_title": subtask_title,
                "subtask_index": i,
                "start": None,
                "end": None,
                "duration_minutes": duration,
                "original_estimate": raw_minutes,
                "adjusted_estimate": duration,
                "buffer_minutes": 0,
                "overflow": True,
                "steps": subtask.get("steps", []),
            })

    return operations


# ─── Ripple Effect ─────────────────────────────────────────────────────

def ripple_tasks(
    schedule_ops: List[Dict],
    from_index: int,
    extra_minutes: int,
) -> List[Dict]:
    """
    The Ripple Effect: when a user hits "+15 mins" on a task, shift ALL
    subsequent non-fixed tasks forward by that amount.

    Args:
        schedule_ops: current list of scheduled operations
        from_index: the index of the task that's overrunning
        extra_minutes: how many minutes to push forward (e.g., 15)

    Returns:
        Updated schedule with rippled times
    """
    delta = timedelta(minutes=extra_minutes)

    for op in schedule_ops:
        idx = op.get("subtask_index", -1)
        if idx <= from_index:
            continue

        if op.get("overflow") or not op.get("start") or not op.get("end"):
            continue

        # Shift forward
        old_start = datetime.fromisoformat(op["start"])
        old_end = datetime.fromisoformat(op["end"])
        op["start"] = (old_start + delta).isoformat()
        op["end"] = (old_end + delta).isoformat()
        op["rippled"] = True

    # Also extend the overrunning task itself
    for op in schedule_ops:
        if op.get("subtask_index") == from_index and op.get("end"):
            old_end = datetime.fromisoformat(op["end"])
            op["end"] = (old_end + delta).isoformat()
            op["duration_minutes"] = op.get("duration_minutes", 0) + extra_minutes
            break

    return schedule_ops


# ─── Deviation Tracking ───────────────────────────────────────────────

def update_deviation_ratio(
    current_ratio: float, current_samples: int,
    estimated: int, actual: int,
) -> Tuple[float, int]:
    """
    Update the running average deviation ratio (exponential moving average).
    """
    if estimated <= 0:
        return current_ratio, current_samples

    new_ratio = actual / estimated
    new_samples = current_samples + 1

    alpha = min(0.3, 2 / (new_samples + 1))
    updated_ratio = current_ratio * (1 - alpha) + new_ratio * alpha
    updated_ratio = max(0.5, min(updated_ratio, 3.0))

    return round(updated_ratio, 2), new_samples
