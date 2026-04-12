from google import genai
import os
import json
import re

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
client = genai.Client(api_key=GEMINI_API_KEY)

CHAT_SYSTEM_PROMPT = """You are Unstuck, a warm ADHD-friendly planning coach.

Your job is to answer like a helpful conversational assistant, not like a JSON task parser.
Be concise, specific, calm, and practical. Use short paragraphs or bullets only when useful.
Help the user feel less stuck and more able to take the next tiny action.

Decide whether the user's latest message should also become a scheduled task:
- true when they ask to plan, schedule, add, break down, start, or organize a concrete task
- true when they describe a task they need to do, especially with a due date or time
- false for normal questions, emotional support, explanations, greetings, or follow-up conversation

Return ONLY valid JSON with this exact schema:
{
  "reply": "Natural coach-style answer shown to the user.",
  "should_create_task": false
}
"""

PROMPT_TEMPLATE = """You are an executive functioning AI assistant for someone with ADHD.
They need help breaking down the following task into actionable, non-overwhelming subtasks 
with concrete steps to start each subtask. You also manage their calendar.

Context about the user:
- Their time deviation ratio is {deviation_ratio} (>1 means they underestimate how long things take)
- Current date/time: {current_time}
- User's timezone: {user_timezone}
- Their existing calendar events: {existing_events}

Chat History Context (if any):
{chat_history}

Return ONLY a valid JSON object (no markdown, no code fences) with this exact schema:
{{
  "title": "Short title of the overall task",
  "estimated_minutes": 120,
  "priority": "high",
  "deadline": "2026-04-15T17:00:00" or null,
  "is_fixed_deadline": true,
  "explicit_start_time": "05:00" or null,
  "start_immediately": false,
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
      "doc_outline": "## Intro\\n- Key point 1\\n- Key point 2\\n\\n## Section 1\\n...",
      "needs_email": true,
      "email_subject": "Draft email subject",
      "email_body": "Draft email body",
      "email_recipient": "recipient@example.com"
    }}
  ]
}}

SCHEDULING RULES:
- "deadline": ONLY set this when the user says the task must be FINISHED/SUBMITTED/DUE by a 
  certain time (e.g. "assignment due Friday", "submit by 5pm", "exam on Monday").
  Do NOT set deadline when the user says when they WANT TO START or DO the task.
  Set to null if no due date is mentioned.
- "is_fixed_deadline": true only when deadline is set AND it is a hard cutoff.
- "explicit_start_time": Set this (as "HH:MM" in 24h format) when the user says they want to 
  START or DO the task at a specific time (e.g. "do it at 5am", "work on it at 2pm", 
  "schedule for 9am"). This is the START time, not a deadline. Set to null otherwise.
- "start_immediately": Set to true when the user says "now", "right now", "immediately", 
  "asap", or implies they want to start without delay. Set to false otherwise.
  When true, preferred_time should be null (ignore time-of-day preference).
- "preferred_time": Extract time-of-day preferences ONLY if no explicit_start_time or 
  start_immediately is set (e.g. "morning", "afternoon", "evening"). Set to null otherwise.
- "needs_clarification": If the task is ambiguous and you need critical scheduling information to 
  proceed (e.g. the user says "finish the project" but you don't know what project or when), 
  set this to a SHORT follow-up question string (e.g. "When is this due? And what does 'finish' mean for this project?").
  If you have enough info, set to null. Only ask when truly necessary — prefer making reasonable assumptions.

TASK BREAKDOWN RULES:
- Each task must have 1-5 concrete, actionable steps as subtasks
- Steps should start with a verb and be specific enough to act on immediately
- Assign priority: "high" for deadline-driven, "medium" for important, "low" for nice-to-have
- If a subtask involves writing/creating a document, set needs_doc=true and provide a doc_outline
- If a subtask involves writing/sending an email, set needs_email=true and provide the email_subject, email_body, and email_recipient (if known).
- The time estimate should be a realistic estimation of the time needed for such a task for someone with ADHD
- Be flexible with the breakdown, simpler tasks can be done in 1-2 small subtasks while larger tasks can be broken down into more subtasks
- Account for the user's deviation ratio when estimating minutes

User Task Dump:
"{user_input}"
"""


def parse_user_task(user_input: str, deviation_ratio: float = 1.5,
                    current_time: str = "", existing_events: str = "none",
                    user_timezone: str = "America/Chicago",
                    chat_history: str = "No prior messages."):
    """Parse a natural language task dump into structured subtasks using Gemini."""
    prompt = PROMPT_TEMPLATE.format(
        user_input=user_input,
        deviation_ratio=deviation_ratio,
        current_time=current_time,
        existing_events=existing_events,
        user_timezone=user_timezone,
        chat_history=chat_history,
    )

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash-lite',
            contents=prompt
        )

        raw_text = response.text.strip()
        print(f"\n==================================================")
        print(f"🤖 Gemini Raw Response:")
        print(f"==================================================")
        print(raw_text)
        print(f"==================================================\n")

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


def looks_like_task_request(message: str) -> bool:
    lower_message = message.lower()
    task_phrases = [
        "i need to", "need to", "i have to", "have to", "due", "deadline",
        "schedule", "plan", "add", "break down", "finish", "write", "study",
        "email", "clean", "review", "prepare", "complete", "work on", "draft",
        "assignment", "homework", "project"
    ]
    return any(phrase in lower_message for phrase in task_phrases)


def basic_chat_fallback(message: str, error: Exception | None = None) -> str:
    """Small local fallback for when Gemini is unavailable or quota-limited."""
    normalized = message.lower().strip()
    quota_limited = error and (
        "RESOURCE_EXHAUSTED" in str(error) or "quota" in str(error).lower()
    )
    prefix = (
        "Gemini is temporarily out of free-tier requests, so I’m in basic mode. "
        if quota_limited
        else ""
    )

    addition_match = re.search(r"(-?\d+(?:\.\d+)?)\s*\+\s*(-?\d+(?:\.\d+)?)", normalized)
    if addition_match:
        left = float(addition_match.group(1))
        right = float(addition_match.group(2))
        total = left + right
        display_total = int(total) if total.is_integer() else total
        return f"{prefix}The answer is {display_total}."

    if "a + b" in normalized and ("square" in normalized or "squared" in normalized):
        return f"{prefix}The formula for (a + b) squared is a^2 + 2ab + b^2."

    if "numerator" in normalized:
        return (
            f"{prefix}A numerator is the top number in a fraction. "
            "In 3/4, the numerator is 3. It tells you how many parts you have."
        )

    if "denominator" in normalized:
        return (
            f"{prefix}A denominator is the bottom number in a fraction. "
            "In 3/4, the denominator is 4. It tells you how many equal parts make the whole."
        )

    if "should i leave" in normalized and ("homework" in normalized or "hw" in normalized):
        return (
            f"{prefix}If the homework is due soon, don’t abandon it completely. "
            "Do the smallest useful version: one problem, one example, or five focused minutes. "
            "If you’re exhausted, take a short break first and come back with a tiny target."
        )

    if "what" == normalized or normalized in {"what?", "huh", "huh?"}:
        return f"{prefix}I may have missed the context. Ask me the question one more time, and I’ll answer directly."

    if looks_like_task_request(message):
        return (
            f"{prefix}I can still help you plan this. "
            "Tell me the task, the deadline, and how much energy you have, and I’ll keep the next step tiny."
        )

    return (
        f"{prefix}I’m here, but I may not have enough context yet. "
        "Ask me directly, or tell me what feels confusing, and I’ll keep the answer short."
    )


def chat_with_coach(message: str, chat_history: list | None = None) -> dict:
    """Return a natural assistant reply plus whether this should become a task."""
    formatted_history = "No prior messages."
    if chat_history:
        formatted_history = "\n".join(
            f"{msg.get('role', 'unknown')}: {msg.get('text', '')}"
            for msg in chat_history[-12:]
            if isinstance(msg, dict)
        )

    prompt = (
        f"{CHAT_SYSTEM_PROMPT}\n\n"
        f"Conversation so far:\n{formatted_history}\n\n"
        f"Latest user message:\n{message}"
    )

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash-lite',
            contents=prompt
        )
        raw_text = response.text.strip()
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:]
        if raw_text.startswith("```"):
            raw_text = raw_text[3:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]

        cleaned_text = raw_text.strip()
        try:
            data = json.loads(cleaned_text)
        except json.JSONDecodeError:
            start = cleaned_text.find("{")
            end = cleaned_text.rfind("}")
            if start >= 0 and end > start:
                data = json.loads(cleaned_text[start:end + 1])
            else:
                return {
                    "reply": cleaned_text,
                    "should_create_task": looks_like_task_request(message),
                }

        reply = str(data.get("reply", "")).strip()
        if not reply:
            reply = "I’m here. Tell me what feels hardest right now, and we’ll shrink it."

        return {
            "reply": reply,
            "should_create_task": bool(data.get("should_create_task", False)) and looks_like_task_request(message),
        }
    except Exception as e:
        print(f"⚠️  Gemini chat error: {e}")
        return {
            "reply": basic_chat_fallback(message, e),
            "should_create_task": looks_like_task_request(message),
        }

