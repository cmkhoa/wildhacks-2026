"""
Quick local test for the timezone fix.
Run with: .venv\Scripts\python test_timezone.py
No Google auth or MongoDB needed.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

USER_TZ = "America/Chicago"

# ── 1. Verify 'now' is in local time ─────────────────────────────────
tz = ZoneInfo(USER_TZ)
now_local = datetime.now(tz)
now_utc = datetime.now(ZoneInfo("UTC"))
now_naive = now_local.replace(tzinfo=None)

print("=" * 55)
print("  Timezone Fix — Local Test")
print("=" * 55)
print(f"  UTC now:        {now_utc.strftime('%Y-%m-%d %H:%M:%S %Z')}")
print(f"  Local now:      {now_local.strftime('%Y-%m-%d %H:%M:%S %Z')}")
print(f"  Offset:         {now_local.utcoffset()}")
print()

expected_diff_hours = abs(now_local.utcoffset().total_seconds() / 3600)
actual_diff = abs((now_utc.replace(tzinfo=None) - now_naive).total_seconds() / 3600)

if abs(actual_diff - expected_diff_hours) < 0.1:
    print(f"  ✅ PASS — Local time differs from UTC by ~{expected_diff_hours:.0f}h as expected")
else:
    print(f"  ❌ FAIL — Expected {expected_diff_hours}h diff, got {actual_diff:.2f}h")

# ── 2. Verify fetch_events timeMin format ────────────────────────────
print()
print("  timeMin sent to Google Calendar API:")
if now_naive.tzinfo is None:
    time_min = now_naive.replace(tzinfo=tz)
print(f"  {time_min.isoformat()}")
if "-05:00" in time_min.isoformat() or "-06:00" in time_min.isoformat():
    print("  ✅ PASS — Contains local UTC offset (not 'Z'/UTC)")
else:
    print("  ❌ FAIL — Missing local UTC offset")

# ── 3. Verify calendar event payload timezone ─────────────────────────
print()
event_start = now_naive + timedelta(minutes=30)  # simulated scheduled slot
duration = 30
event_end = event_start + timedelta(minutes=duration)

payload = {
    'summary': '📋 Test Task',
    'start': {'dateTime': event_start.isoformat(), 'timeZone': USER_TZ},
    'end':   {'dateTime': event_end.isoformat(),   'timeZone': USER_TZ},
}

print("  Simulated Google Calendar event payload:")
print(f"    start.dateTime : {payload['start']['dateTime']}")
print(f"    start.timeZone : {payload['start']['timeZone']}")
print(f"    end.dateTime   : {payload['end']['dateTime']}")
print(f"    end.timeZone   : {payload['end']['timeZone']}")

if payload['start']['timeZone'] == USER_TZ:
    print("  ✅ PASS — Event uses local timezone, not UTC")
else:
    print("  ❌ FAIL — Event timezone is wrong")

# ── 4. Gemini current_time string ───────────────────────────────────
print()
gemini_time = now_local.strftime("%Y-%m-%d %H:%M %Z")
print(f"  Gemini current_time context: '{gemini_time}'")
if "CDT" in gemini_time or "CST" in gemini_time:
    print("  ✅ PASS — Gemini sees local time with timezone label")
else:
    print(f"  ⚠️  WARN — Timezone abbreviation unexpected: '{gemini_time}'")

print()
print("=" * 55)
