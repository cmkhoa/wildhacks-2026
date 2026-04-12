"""
Local test for PW-EDF scheduling algorithm.
Tests urgency_score, apply_working_hours, and assign_slots.
No Google auth, MongoDB, or running server needed.

Run with: .venv\Scripts\python test_rebalance.py
"""
from datetime import datetime, timedelta
from types import SimpleNamespace

# Import directly from the service (no DB calls in these functions)
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from services.scheduler_service import (
    urgency_score, apply_working_hours, assign_slots,
    PRIORITY_WEIGHTS, WORKING_HOURS_START, WORKING_HOURS_END,
)

# ── Helpers ────────────────────────────────────────────────────────────

def make_task(title, priority, estimated_minutes, deadline=None,
              is_fixed_deadline=False, scheduled_start=None):
    """Create a mock Task object for testing (no DB/Beanie needed)."""
    return SimpleNamespace(
        title=title,
        priority=priority,
        estimated_minutes=estimated_minutes,
        deadline=deadline,
        is_fixed_deadline=is_fixed_deadline,
        scheduled_start=scheduled_start,
    )

# Simulated "now" = Sunday April 12 at 2:44 AM (before working hours)
NOW = datetime(2026, 4, 12, 2, 44, 0)

PASS_COUNT = 0
FAIL_COUNT = 0

def check(label, condition, detail=""):
    global PASS_COUNT, FAIL_COUNT
    if condition:
        PASS_COUNT += 1
        print(f"  [PASS] {label}")
    else:
        FAIL_COUNT += 1
        print(f"  [FAIL] {label}")
        if detail:
            print(f"         {detail}")


# ── Build a full 7-day open free slot (no events on calendar) ──────────
OPEN_FREE_SLOTS = [(NOW, NOW + timedelta(days=7))]


# ══════════════════════════════════════════════════════════════════════
print("=" * 60)
print("  TEST 1: urgency_score() — priority ordering")
print("=" * 60)

now = NOW
high   = make_task("High Task",   "high",   60)
medium = make_task("Medium Task", "medium", 60)
low    = make_task("Low Task",    "low",    60)

s_high   = urgency_score(high,   now)
s_medium = urgency_score(medium, now)
s_low    = urgency_score(low,    now)

check("High > Medium > Low with no deadlines",
      s_high > s_medium > s_low,
      f"high={s_high}, medium={s_medium}, low={s_low}")


# ══════════════════════════════════════════════════════════════════════
print()
print("=" * 60)
print("  TEST 2: urgency_score() — time pressure beats priority")
print("=" * 60)

# Medium task due in 30 mins should beat High task with no deadline
urgent_medium = make_task("Urgent Medium", "medium", 20,
                           deadline=now + timedelta(minutes=30))
relaxed_high  = make_task("Relaxed High", "high", 60)

s_urgent  = urgency_score(urgent_medium, now)
s_relaxed = urgency_score(relaxed_high,  now)

check("Urgent medium (due in 30m) outscores relaxed high (no deadline)",
      s_urgent > s_relaxed,
      f"urgent_medium={s_urgent:.0f}, relaxed_high={s_relaxed:.0f}")

# Overdue task always gets inf
overdue = make_task("Overdue Task", "low", 30,
                    deadline=now - timedelta(hours=1))
check("Overdue task returns float('inf')",
      urgency_score(overdue, now) == float("inf"))


# ══════════════════════════════════════════════════════════════════════
print()
print("=" * 60)
print("  TEST 3: apply_working_hours() — 6 AM to midnight")
print("=" * 60)

wh_slots = apply_working_hours(OPEN_FREE_SLOTS)

# All windows must start at or after 6 AM
all_start_ok = all(s.hour >= WORKING_HOURS_START or s == s.replace(hour=0, minute=0) == False
                   for s, e in wh_slots)
earliest = min(s.hour for s, e in wh_slots)
latest   = max(e.hour for s, e in wh_slots)  # midnight windows end at 00:00 next day

check("Working hours slots exist after applying filter",
      len(wh_slots) > 0, f"Got {len(wh_slots)} windows")

check(f"No slot starts before 6 AM (earliest start hour = {earliest})",
      earliest >= WORKING_HOURS_START,
      f"Earliest start: {min(s for s, e in wh_slots)}")

# None of the windows should include the 2:44 AM "now" time
slot_covers_now = any(s <= NOW < e for s, e in wh_slots)
check("Current time (2:44 AM) is NOT inside any working-hours window",
      not slot_covers_now,
      f"2:44 AM should fall outside 6AM-midnight windows")

# Should have 7 daily windows for a 7-day open calendar
check(f"7-day open calendar produces exactly 7 daily windows (got {len(wh_slots)})",
      len(wh_slots) == 7)


# ══════════════════════════════════════════════════════════════════════
print()
print("=" * 60)
print("  TEST 4: assign_slots() — urgency ordering in assignment")
print("=" * 60)

# Insert tasks in LOW → HIGH order, verify HIGH gets first slot
tasks_in_insertion_order = [
    make_task("Low Book",   "low",    60),
    make_task("Med Homework", "medium", 60),
    make_task("High Report",  "high",   60),
]
# Sort by urgency (as rebalance_schedule would)
tasks_sorted = sorted(tasks_in_insertion_order,
                      key=lambda t: urgency_score(t, now), reverse=True)

wh_slots = apply_working_hours(OPEN_FREE_SLOTS)
assignments = assign_slots(tasks_sorted, wh_slots, deviation_ratio=1.0, now=now)

order = [a["task"].title for a in assignments if not a["overflow"]]
check("High priority task is scheduled first",
      order[0] == "High Report",
      f"Order: {order}")
check("Low priority task is scheduled last",
      order[-1] == "Low Book",
      f"Order: {order}")
check("No overflow with 3 x 1h tasks in 7-day window",
      all(not a["overflow"] for a in assignments))

first_start  = assignments[0]["start"]
second_start = assignments[1]["start"]
check("Second task starts after first ends",
      second_start >= assignments[0]["end"],
      f"First ends {assignments[0]['end']}, second starts {second_start}")


# ══════════════════════════════════════════════════════════════════════
print()
print("=" * 60)
print("  TEST 5: Displacement simulation — urgent task takes priority")
print("=" * 60)

# Existing schedule: low task owns the first slot
low_task = make_task("Read Book", "low", 60,
                     scheduled_start=datetime(2026, 4, 12, 9, 0))

# New urgent task arrives
urgent_task = make_task("Fix Server", "high", 30,
                        deadline=now + timedelta(hours=2))

# Simulate rebalance: add new task, re-sort by urgency
all_tasks = [low_task, urgent_task]
sorted_tasks = sorted(all_tasks, key=lambda t: urgency_score(t, now), reverse=True)

wh_slots = apply_working_hours(OPEN_FREE_SLOTS)
assignments = assign_slots(sorted_tasks, wh_slots, deviation_ratio=1.0, now=now)

titles_in_order = [a["task"].title for a in assignments]
check("Urgent task (Fix Server) is assigned before low task (Read Book)",
      titles_in_order[0] == "Fix Server",
      f"Assignment order: {titles_in_order}")

urgent_start = assignments[0]["start"]
low_start    = assignments[1]["start"]
check("Urgent task starts before low task's ORIGINAL slot (9 AM)",
      urgent_start < datetime(2026, 4, 12, 9, 0),
      f"Urgent start: {urgent_start}, low original: 09:00")
check("Low task is displaced after urgent task ends",
      low_start >= assignments[0]["end"],
      f"Low displaced to: {low_start}")


# ══════════════════════════════════════════════════════════════════════
print()
print("=" * 60)
print("  TEST 6: Overflow — task that cannot fit")
print("=" * 60)

# Tight 2-hour window (8 AM – 10 AM today only)
tight_slots = [(datetime(2026, 4, 12, 8, 0), datetime(2026, 4, 12, 10, 0))]

tasks_overflow = [
    make_task("Task A", "high", 90),   # fits (90 min in 120-min window)
    make_task("Task B", "medium", 60), # doesn't fit (only 30 min left after Task A)
]
sorted_overflow = sorted(tasks_overflow,
                         key=lambda t: urgency_score(t, now), reverse=True)
assignments_overflow = assign_slots(sorted_overflow, tight_slots, 1.0, now)

check("Task A (90 min) is scheduled in the tight window",
      not assignments_overflow[0]["overflow"])
check("Task B (60 min) overflows because only 30 min remains",
      assignments_overflow[1]["overflow"],
      f"Task B overflow: {assignments_overflow[1]['overflow']}")


# ══════════════════════════════════════════════════════════════════════
print()
print("=" * 60)
result = "ALL PASS" if FAIL_COUNT == 0 else f"{FAIL_COUNT} FAILED, {PASS_COUNT} PASSED"
print(f"  Result: {result}")
print("=" * 60)
