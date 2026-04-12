from typing import Optional, List
from pydantic import BaseModel, Field
from beanie import Document
from datetime import datetime


class Subtask(Document):
    task_id: str
    title: str
    steps: List[str] = []  # Ordered action steps from Gemini
    estimated_minutes: int = 15
    order: int = 0  # Sequence index within the parent task
    completed: bool = False
    reward_value: int = 10
    calendar_event_id: Optional[str] = None  # Each subtask gets its own calendar block


class Task(Document):
    user_id: str
    title: str
    description: Optional[str] = None
    original_prompt: str
    status: str = "pending"  # pending | in_progress | completed
    priority: str = "medium"  # high | medium | low
    estimated_minutes: int = 30
    actual_minutes: Optional[int] = None
    deadline: Optional[datetime] = None
    is_fixed_deadline: bool = False  # True for hard deadlines like "due Friday"
    explicit_start_time: Optional[str] = None  # e.g., "17:00" if user asks for specific time
    start_immediately: bool = False
    is_ai_managed: bool = True       # False = user pinned this block, never displaced
    scheduled_start: Optional[datetime] = None  # When the calendar event starts
    scheduled_end: Optional[datetime] = None  # When the calendar event ends
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    calendar_event_id: Optional[str] = None
    drive_doc_link: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class User(Document):
    email: str = Field(unique=True, index=True)
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    token_expiry: Optional[datetime] = None
    # ADHD deviation tracking: ratio of actual/estimated time
    # > 1.0 means user underestimates (typical for ADHD), default 1.5
    time_deviation_ratio: float = 1.5
    deviation_samples: int = 0  # Number of completed tasks used to compute ratio
    reward_points: int = 0
    grace_passes: int = 0
    timezone: str = "America/Chicago"  # User's local timezone for calendar scheduling

