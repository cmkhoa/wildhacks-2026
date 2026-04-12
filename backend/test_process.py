import asyncio
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)
response = client.post("/api/tasks/process", json={"user_input": "test", "email": "haiha"})
print("Status:", response.status_code)
print("Body:", response.text)
