from google import genai
import os
import json

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "YOUR_GEMINI_API_KEY")
client = genai.Client(api_key=GEMINI_API_KEY)

PROMPT_TEMPLATE = """
You are an executive functioning AI assistant for someone with ADHD. 
They need help breaking down the following task dump into actionable, non-overwhelming subtasks and a schedule plan.
Return a properly formatted JSON object with the following schema:
{
  "title": "Short title of the overall task",
  "schedule_minutes": 60,
  "subtasks": [
    {"title": "Small actionable 1", "reward_value": 15},
    {"title": "Small actionable 2", "reward_value": 20}
  ],
  "needs_doc": true,
  "doc_title": "Suggested document title if they need a blank canvas"
}

User Task Dump:
"{user_input}"
"""

def parse_user_task(user_input: str):
    prompt = PROMPT_TEMPLATE.replace("{user_input}", user_input)
    
    try:
        # We use gemini-1.5-flash as requested by project specs/history.
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=prompt
        )
        
        raw_text = response.text
        # Safely strip markdown formatting if any
        if raw_text.startswith("```json"):
            raw_text = raw_text.strip("```json").strip("```").strip()
        elif raw_text.startswith("```"):
            raw_text = raw_text.strip("```").strip()
            
        data = json.loads(raw_text)
        return data
    except Exception as e:
        # Fallback if parser fails or API key is invalid (which serves as our offline demo fallback)
        return {
            "title": "Parsed Task Error",
            "schedule_minutes": 30,
            "subtasks": [{"title": "Review task requirements", "reward_value": 10}],
            "needs_doc": False,
            "doc_title": ""
        }
