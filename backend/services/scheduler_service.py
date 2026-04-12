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
    user_timezone: str = "America/Chicago",
) -> List[Tuple[datetime, datetime]]:
    """
    Given Google Calendar events and a day boundary,
    returns (start, end) free slot tuples.
    All datetimes are normalized to the user's local timezone.
    """
    from zoneinfo import ZoneInfo
    tz = ZoneInfo(user_timezone)

    busy = []
    for ev in events:
        start_raw = ev.get("start", {}).get("dateTime") or ev.get("start", {}).get("date")
        end_raw = ev.get("end", {}).get("dateTime") or ev.get("end", {}).get("date")
        if not start_raw or not end_raw:
            continue
        try:
            # Convert to user's local timezone (strip tzinfo to keep naive-comparable)
            start = datetime.fromisoformat(start_raw.replace("Z", "+00:00")).astimezone(tz).replace(tzinfo=None)
            end = datetime.fromisoformat(end_raw.replace("Z", "+00:00")).astimezone(tz).replace(tzinfo=None)
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


# ─── PW-EDF: Priority-Weighted Earliest Deadline First ────────────────

PRIORITY_WEIGHTS = {"high": 1000, "medium": 500, "low": 100}

# Working hours: tasks will only be scheduled within these hours each day
WORKING_HOURS_START = 6   # 6 AM
WORKING_HOURS_END = 24    # midnight (end of day)


def urgency_score(task, now: datetime) -> float:
    """
    Compute an urgency score for a task.
    Score = Priority Weight + Time Pressure
    Time Pressure = (estimated_minutes / minutes_left) × 10,000

    Higher score → scheduled earlier in the rebalanced queue.
    Overdue tasks return float('inf') so they always float to the top.
    """
    priority_pts = PRIORITY_WEIGHTS.get(
        task.priority if hasattr(task, "priority") else task.get("priority", "medium"),
        500,
    )
    deadline = task.deadline if hasattr(task, "deadline") else task.get("deadline")
    estimated = (
        task.estimated_minutes
        if hasattr(task, "estimated_minutes")
        else task.get("estimated_minutes", 30)
    )

    if deadline:
        minutes_left = (deadline - now).total_seconds() / 60
        if minutes_left <= 0:
            return float("inf")  # overdue → always first
        time_pressure = (estimated / minutes_left) * 10_000
    else:
        time_pressure = 0.0

    return priority_pts + time_pressure


def apply_working_hours(
    free_slots: List[Tuple[datetime, datetime]],
    work_start_hour: int = WORKING_HOURS_START,
    work_end_hour: int = WORKING_HOURS_END,
) -> List[Tuple[datetime, datetime]]:
    """
    Clip free slots to working hours (default 6 AM – midnight) each day.
    A slot spanning multiple days is split into per-day windows.
    """
    result = []
    for slot_start, slot_end in free_slots:
        # Walk through each calendar day the slot touches
        current = slot_start.replace(hour=0, minute=0, second=0, microsecond=0)
        while current < slot_end:
            day_work_start = current.replace(hour=work_start_hour, minute=0, second=0)
            # work_end_hour=24 means midnight (start of next day)
            if work_end_hour >= 24:
                day_work_end = (current + timedelta(days=1)).replace(
                    hour=0, minute=0, second=0, microsecond=0
                )
            else:
                day_work_end = current.replace(hour=work_end_hour, minute=0, second=0)

            # Intersect the working window with the actual free slot
            clipped_start = max(slot_start, day_work_start)
            clipped_end = min(slot_end, day_work_end)

            if clipped_start < clipped_end:
                result.append((clipped_start, clipped_end))

            # Advance to the next day
            current += timedelta(days=1)

    return result


def consume_slot(free_slots: List[Tuple[datetime, datetime]], start: datetime, end: datetime) -> List[Tuple[datetime, datetime]]:
    """Remove a block of time [start, end] from the free_slots list."""
    new_slots = []
    for fs_start, fs_end in free_slots:
        if end <= fs_start or start >= fs_end:
            # No overlap
            new_slots.append((fs_start, fs_end))
        elif start <= fs_start and end >= fs_end:
            # Slot is completely consumed
            continue
        elif start > fs_start and end < fs_end:
            # Consumed from the middle (splits the slot into two)
            new_slots.append((fs_start, start))
            new_slots.append((end, fs_end))
        elif start <= fs_start and end < fs_end:
            # Consumes the beginning of the slot
            new_slots.append((end, fs_end))
        elif start > fs_start and end >= fs_end:
            # Consumes the end of the slot
            new_slots.append((fs_start, start))
    return sorted(new_slots, key=lambda x: x[0])


def assign_slots(
    tasks_sorted: List,
    free_slots: List[Tuple[datetime, datetime]],
    deviation_ratio: float,
    now: datetime,
) -> List[Dict]:
    """
    Greedy slot-packing: assigns each task according to its constraints.
    - explicit_start_time: placed EXACTLY at that time if possible.
    - start_immediately: placed at the earliest available slot from now.
    - is_fixed_deadline: backfilled from the deadline (to give ADHD breathing room).
    - default: placed at the earliest available slot.

    The free_slots list is consumed incrementally to prevent overlaps.
    """
    from services.calendar_sync_service import _find_slot_before_deadline # (Import here to avoid circular dep if needed, actually it's fine since it's just logic)
    
    # Sort tasks so pinned tasks go FIRST (explicit_start_time, start_immediately)
    # Then the rest strictly by urgency score.
    def sort_key(t):
        pinned = hasattr(t, "explicit_start_time") and t.explicit_start_time is not None
        imm = hasattr(t, "start_immediately") and t.start_immediately
        if pinned or imm:
            return float('inf') # Pin first
        return urgency_score(t, now)

    tasks_ordered = sorted(tasks_sorted, key=sort_key, reverse=True)
    
    assignments = []
    current_free = list(free_slots)

    for task in tasks_ordered:
        estimated = task.estimated_minutes if hasattr(task, "estimated_minutes") else task.get("estimated_minutes", 30)
        duration = adjust_duration(estimated, deviation_ratio)
        needed = timedelta(minutes=duration)
        scheduled = False

        explicit = getattr(task, "explicit_start_time", None)
        imm = getattr(task, "start_immediately", False)
        is_fixed = getattr(task, "is_fixed_deadline", False)
        deadline = getattr(task, "deadline", None)

        if explicit:
            # Pinned exact start time
            try:
                target_hour, target_minute = map(int, explicit.split(":"))
                target_dt = now.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
                if target_dt < now:
                    target_dt += timedelta(days=1)
                
                # Check if this target time fits in any slot
                for slot_start, slot_end in current_free:
                    if slot_start <= target_dt and slot_end >= target_dt + needed:
                        assignments.append({
                            "task": task, "start": target_dt, "end": target_dt + needed, "overflow": False
                        })
                        current_free = consume_slot(current_free, target_dt, target_dt + needed)
                        scheduled = True
                        break
                # Fallback: find earliest slot AFTER explicit time
                if not scheduled:
                    for slot_start, slot_end in current_free:
                        effective = max(slot_start, target_dt)
                        if slot_end - effective >= needed:
                            assignments.append({
                                "task": task, "start": effective, "end": effective + needed, "overflow": False
                            })
                            current_free = consume_slot(current_free, effective, effective + needed)
                            scheduled = True
                            break
            except:
                pass

        if not scheduled and imm:
            # Start ASAP
            for slot_start, slot_end in current_free:
                effective = max(slot_start, now)
                if slot_end - effective >= needed:
                    assignments.append({
                        "task": task, "start": effective, "end": effective + needed, "overflow": False
                    })
                    current_free = consume_slot(current_free, effective, effective + needed)
                    scheduled = True
                    break

        if not scheduled and is_fixed and deadline:
            # Backfill from deadline
            valid = []
            for slot_start, slot_end in current_free:
                effective_end = min(slot_end, deadline)
                if effective_end - slot_start >= needed:
                    valid.append((slot_start, effective_end))
            if valid:
                s_start, s_end = valid[-1]
                event_start = s_end - needed
                assignments.append({
                    "task": task, "start": event_start, "end": event_start + needed, "overflow": False
                })
                current_free = consume_slot(current_free, event_start, event_start + needed)
                scheduled = True

        if not scheduled:
            # Earliest free slot (Fluid/Normal fallback)
            for slot_start, slot_end in current_free:
                if slot_end - slot_start >= needed:
                    assignments.append({
                        "task": task, "start": slot_start, "end": slot_start + needed, "overflow": False
                    })
                    current_free = consume_slot(current_free, slot_start, slot_start + needed)
                    scheduled = True
                    break

        if not scheduled:
            assignments.append({"task": task, "start": None, "end": None, "overflow": True})

    return assignments
