"""
Local test for scheduling logic fixes.
No Google auth or MongoDB needed.
Run with: .venv\Scripts\python test_scheduling.py
"""
from datetime import datetime, timedelta

# ── Helpers (duplicated from calendar_sync_service for local testing) ──

PREFERRED_TIME_RANGES = {
    "morning":   (8, 12),
    "afternoon": (12, 17),
    "evening":   (17, 21),
}

def _filter_slots_by_preference(free_slots, preferred_time):
    if not preferred_time or preferred_time not in PREFERRED_TIME_RANGES:
        return free_slots
    start_hour, end_hour = PREFERRED_TIME_RANGES[preferred_time]
    filtered = []
    for slot_start, slot_end in free_slots:
        pref_start = slot_start.replace(hour=max(slot_start.hour, start_hour), minute=0, second=0)
        pref_end   = slot_end.replace(hour=min(slot_end.hour, end_hour), minute=0, second=0)
        if pref_start < slot_start: pref_start = slot_start
        if pref_end > slot_end:     pref_end = slot_end
        if pref_start < pref_end:
            filtered.append((pref_start, pref_end))
    return filtered if filtered else free_slots

def _find_slot_for_duration(free_slots, duration_minutes):
    needed = timedelta(minutes=duration_minutes)
    for slot_start, slot_end in free_slots:
        if slot_end - slot_start >= needed:
            return (slot_start, slot_start + needed)
    return None

def _find_slot_before_deadline(free_slots, duration_minutes, deadline):
    needed = timedelta(minutes=duration_minutes)
    valid = []
    for slot_start, slot_end in free_slots:
        effective_end = min(slot_end, deadline)
        if effective_end - slot_start >= needed:
            valid.append((slot_start, effective_end))
    if not valid:
        return None
    slot_start, slot_end = valid[-1]
    event_start = slot_end - needed
    return (event_start, event_start + needed)

def simulate_schedule(label, now, parsed_data, task_duration, existing_busy=None):
    """
    Simulate what calendar_sync_service would schedule.
    existing_busy: list of (start, end) naive datetimes that are already on calendar.
    """
    look_ahead_end = now + timedelta(days=7)

    # Build free slots from busy list
    busy = sorted(existing_busy or [], key=lambda x: x[0])
    free_slots = []
    cursor = now
    for bs, be in busy:
        if cursor < bs:
            free_slots.append((cursor, bs))
        cursor = max(cursor, be)
    if cursor < look_ahead_end:
        free_slots.append((cursor, look_ahead_end))

    start_immediately   = parsed_data.get("start_immediately", False)
    explicit_start_time = parsed_data.get("explicit_start_time")
    deadline_str        = parsed_data.get("deadline")
    is_fixed_deadline   = parsed_data.get("is_fixed_deadline", False)

    deadline = None
    if deadline_str:
        deadline = datetime.fromisoformat(deadline_str)

    preferred_time = None if start_immediately else parsed_data.get("preferred_time")
    filtered_slots = _filter_slots_by_preference(free_slots, preferred_time)

    scheduled_start = scheduled_end = None

    if start_immediately:
        result = _find_slot_for_duration(free_slots, task_duration)
        if result:
            scheduled_start, scheduled_end = result

    elif explicit_start_time:
        target_hour, target_minute = map(int, explicit_start_time.split(":"))
        target_dt = now.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
        if target_dt < now:
            target_dt += timedelta(days=1)
        for slot_start, slot_end in free_slots:
            if slot_start <= target_dt and slot_end >= target_dt + timedelta(minutes=task_duration):
                scheduled_start = target_dt
                scheduled_end   = target_dt + timedelta(minutes=task_duration)
                break
        if not scheduled_start:
            for slot_start, slot_end in free_slots:
                if slot_end >= target_dt + timedelta(minutes=task_duration):
                    scheduled_start = max(slot_start, target_dt)
                    scheduled_end   = scheduled_start + timedelta(minutes=task_duration)
                    break

    elif deadline and is_fixed_deadline:
        result = _find_slot_before_deadline(filtered_slots, task_duration, deadline)
        if result:
            scheduled_start, scheduled_end = result
        else:
            result = _find_slot_before_deadline(free_slots, task_duration, deadline)
            if result:
                scheduled_start, scheduled_end = result

    else:
        result = _find_slot_for_duration(filtered_slots, task_duration)
        if result:
            scheduled_start, scheduled_end = result
        else:
            result = _find_slot_for_duration(free_slots, task_duration)
            if result:
                scheduled_start, scheduled_end = result

    return scheduled_start, scheduled_end, label


# ── Test Cases ─────────────────────────────────────────────────────────

# Simulated "now" = 1:50 AM Chicago
NOW = datetime(2026, 4, 12, 1, 50, 0)

TESTS = [
    {
        "label": '[SCENARIO 1] "do assignment at 6am, takes 1 hour"',
        "expected_start": "06:00",
        "expected_end":   "07:00",
        "duration": 60,
        "parsed_data": {
            "explicit_start_time": "06:00",
            "start_immediately": False,
            "preferred_time": None,
            "deadline": None,
            "is_fixed_deadline": False,
        },
        "busy": [],
    },
    {
        "label": '[SCENARIO 2] "assignment DUE at 6am, takes 1 hour" (backfill)',
        "expected_start": "05:00",
        "expected_end":   "06:00",
        "duration": 60,
        "parsed_data": {
            "explicit_start_time": None,
            "start_immediately": False,
            "preferred_time": None,
            "deadline": "2026-04-12T06:00:00",
            "is_fixed_deadline": True,
        },
        "busy": [],
    },
    {
        "label": '[SCENARIO 3] "cook breakfast now, takes 30 mins"',
        "expected_start": "01:50",
        "expected_end":   "02:20",
        "duration": 30,
        "parsed_data": {
            "start_immediately": True,
            "explicit_start_time": None,
            "preferred_time": "morning",  # LLM might still set this — should be ignored
            "deadline": None,
            "is_fixed_deadline": False,
        },
        "busy": [],
    },
    {
        "label": '[SCENARIO 4] "study tomorrow morning" (prefers morning)',
        "expected_start": "08:00",
        "expected_end":   "09:00",
        "duration": 60,
        "parsed_data": {
            "start_immediately": False,
            "explicit_start_time": None,
            "preferred_time": "morning",
            "deadline": None,
            "is_fixed_deadline": False,
        },
        "busy": [],
    },
]

print("=" * 60)
print("  Scheduling Logic — Local Test")
print("=" * 60)

all_passed = True
for test in TESTS:
    start, end, label = simulate_schedule(
        test["label"], NOW, test["parsed_data"],
        test["duration"], test.get("busy", []),
    )
    exp_start = test["expected_start"]
    exp_end   = test["expected_end"]

    got_start = start.strftime("%H:%M") if start else "None"
    got_end   = end.strftime("%H:%M")   if end   else "None"

    passed = (got_start == exp_start and got_end == exp_end)
    all_passed = all_passed and passed

    status = "PASS" if passed else "FAIL"
    print(f"\n  [{status}] {label}")
    print(f"    Expected : {exp_start} -> {exp_end}")
    print(f"    Got      : {got_start} -> {got_end}")

print()
print("=" * 60)
print(f"  Result: {'ALL PASS' if all_passed else 'SOME TESTS FAILED'}")
print("=" * 60)
