from google import genai
import os
import json

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
client = genai.Client(api_key=GEMINI_API_KEY)

PROMPT_TEMPLATE = """You are an executive functioning AI assistant for someone with ADHD.
They need help breaking down the following task into actionable, non-overwhelming subtasks 
with concrete steps to start each subtask. You also manage their calendar.

Context about the user:
- Their time deviation ratio is {deviation_ratio} (>1 means they underestimate how long things take)
- Current date/time: {current_time}
- User's timezone: {user_timezone}
- Their existing calendar events: {existing_events}

Return ONLY a valid JSON object (no markdown, no code fences) with this exact schema:
{{
  "title": "Short title of the overall task",
  "estimated_minutes": 120,
  "priority": "high",
  "deadline": "2026-04-15T17:00:00" or null,
  "is_fixed_deadline": true,
  "preferred_time": "morning" or "afternoon" or "evening" or null,
  "needs_clarification": null,
  "subtasks": [
    {{
      "title": "Subtask name",
      "estimated_minutes": 30,
      "steps": [
        "Step 1: Specific concrete action",
        "Step 2: Next concrete action",
        "Step 3: Final action for this subtask"
      ],
      "needs_doc": true,
      "doc_title": "Document title if a starter doc would help",
      "doc_outline": "## Intro\\n- Key point 1\\n- Key point 2\\n\\n## Section 1\\n..."
    }}
  ]
}}

SCHEDULING RULES:
- "deadline": Extract any mentioned deadline as an ISO datetime string. Convert relative dates 
  like "Friday", "next week", "tomorrow" into actual ISO datetimes using the current date/time.
  Set to null if no deadline is mentioned.
- "is_fixed_deadline": true if the user mentions a hard deadline ("due Friday", "submit by 5pm", 
  "exam on Monday"). false if it's flexible ("sometime this week", "when I get a chance") or no deadline.
- "preferred_time": Extract time-of-day preferences if mentioned ("morning", "afternoon", "evening").
  Set to null if not mentioned.
- "needs_clarification": If the task is ambiguous and you need critical scheduling information to 
  proceed (e.g. the user says "finish the project" but you don't know what project or when), 
  set this to a SHORT follow-up question string (e.g. "When is this due? And what does 'finish' mean for this project?").
  If you have enough info, set to null. Only ask when truly necessary — prefer making reasonable assumptions.

TASK BREAKDOWN RULES:
- Each task must have 1-5 concrete, actionable steps as subtasks
- Steps should start with a verb and be specific enough to act on immediately
- Assign priority: "high" for deadline-driven, "medium" for important, "low" for nice-to-have
- If a subtask involves writing/creating, set needs_doc=true and provide a doc_outline
- The time estimate should be a realistic estimation of the time needed for such a task for someone with ADHD
- Be flexible with the breakdown, simpler tasks can be done in 1-2 small subtasks while larger tasks can be broken down into more subtasks
- Account for the user's deviation ratio when estimating minutes

User Task Dump:
"{user_input}"
"""


def parse_user_task(user_input: str, deviation_ratio: float = 1.5,
                    current_time: str = "", existing_events: str = "none",
                    user_timezone: str = "America/Chicago"):
    """Parse a natural language task dump into structured subtasks using Gemini."""
    prompt = PROMPT_TEMPLATE.format(
        user_input=user_input,
        deviation_ratio=deviation_ratio,
        current_time=current_time,
        existing_events=existing_events,
        user_timezone=user_timezone,
    )

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash-lite',
            contents=prompt
        )

        raw_text = response.text.strip()
        # Strip markdown code fences if present
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:]
        if raw_text.startswith("```"):
            raw_text = raw_text[3:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
        raw_text = raw_text.strip()

        data = json.loads(raw_text)
        return data
    except Exception as e:
        print(f"⚠️  Gemini parse error: {e}")
        # Fallback for offline/demo mode
        return {
            "title": "Parsed Task",
            "estimated_minutes": 30,
            "priority": "medium",
            "deadline": None,
            "is_fixed_deadline": False,
            "preferred_time": None,
            "needs_clarification": None,
            "subtasks": [{
                "title": "Review task requirements",
                "estimated_minutes": 15,
                "steps": ["Read through the task description", "Identify key deliverables", "List questions"],
                "needs_doc": False,
                "doc_title": "",
                "doc_outline": ""
            }]
        }

