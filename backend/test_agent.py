import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from services.agent_service import parse_user_task

def test_parser():
    # Will hit the error path since API key is "YOUR_GEMINI_API_KEY"
    res = parse_user_task("I need to study math, physics, and history for my midterms.")
    print("Parsed output:", res)
    assert res["title"] == "Parsed Task Error"
    assert len(res["subtasks"]) > 0
    print("Test passed without real API Key! Schema fallback verified.")

if __name__ == "__main__":
    test_parser()
