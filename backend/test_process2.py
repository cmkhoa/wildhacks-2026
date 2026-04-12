import asyncio
from fastapi.testclient import TestClient
from main import app

with TestClient(app) as client:
    response = client.post("/api/tasks/process", json={"user_input": "test", "email": "haiha"})
    print("Status:", response.status_code)
    print("Body:", response.text)
