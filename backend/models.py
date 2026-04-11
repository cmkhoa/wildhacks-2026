from typing import Optional, List
from pydantic import BaseModel, Field
from beanie import Document, Link

class Subtask(Document):
    task_id: str
    title: str
    completed: bool = False
    reward_value: int = 10

class Task(Document):
    user_id: str
    title: str
    description: Optional[str] = None
    original_prompt: str
    status: str = "pending"
    calendar_event_id: Optional[str] = None
    drive_doc_link: Optional[str] = None
    subtasks: List[Link[Subtask]] = []

class User(Document):
    email: str = Field(unique=True, index=True)
    google_tokens: Optional[str] = None
    reward_points: int = 0
    grace_passes: int = 0
    tasks: List[Link[Task]] = []
