"""
Google Service — Wrappers for Google Calendar and Google Drive APIs.

Handles:
- Building authenticated services from stored user tokens
- Fetching, creating, updating, and deleting calendar events
- Creating templated Google Docs with AI-generated outlines
"""
import os
from datetime import datetime, timedelta
from typing import Optional, List, Dict
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build


def _build_credentials(access_token: str, refresh_token: str) -> Credentials:
    """Build Google OAuth credentials from stored tokens."""
    return Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.environ.get("GOOGLE_CLIENT_ID"),
        client_secret=os.environ.get("GOOGLE_CLIENT_SECRET"),
    )


def get_calendar_service(access_token: str, refresh_token: str):
    creds = _build_credentials(access_token, refresh_token)
    return build('calendar', 'v3', credentials=creds)


def get_drive_service(access_token: str, refresh_token: str):
    creds = _build_credentials(access_token, refresh_token)
    return build('drive', 'v3', credentials=creds)


def get_docs_service(access_token: str, refresh_token: str):
    creds = _build_credentials(access_token, refresh_token)
    return build('docs', 'v1', credentials=creds)


def get_gmail_service(access_token: str, refresh_token: str):
    creds = _build_credentials(access_token, refresh_token)
    return build('gmail', 'v1', credentials=creds)


# ─── Calendar Operations ───────────────────────────────────────────────

def fetch_events(service, time_min: datetime, time_max: datetime, user_timezone: str = "UTC") -> List[Dict]:
    """Fetch all events from Google Calendar in the given time range."""
    from zoneinfo import ZoneInfo
    # Ensure time_min and time_max are timezone-aware before formatting
    tz = ZoneInfo(user_timezone)
    if time_min.tzinfo is None:
        time_min = time_min.replace(tzinfo=tz)
    if time_max.tzinfo is None:
        time_max = time_max.replace(tzinfo=tz)
    events_result = service.events().list(
        calendarId='primary',
        timeMin=time_min.isoformat(),
        timeMax=time_max.isoformat(),
        singleEvents=True,
        orderBy='startTime'
    ).execute()
    return events_result.get('items', [])


def create_calendar_event(
    service,
    title: str,
    start_time: datetime,
    duration_minutes: int,
    description: str = "",
    color_id: str = None,
    timezone: str = "America/Chicago",
) -> str:
    """Create a new event and return its ID."""
    end_time = start_time + timedelta(minutes=duration_minutes)
    event = {
        'summary': title,
        'description': description,
        'start': {'dateTime': start_time.isoformat(), 'timeZone': timezone},
        'end': {'dateTime': end_time.isoformat(), 'timeZone': timezone},
    }
    if color_id:
        event['colorId'] = color_id

    result = service.events().insert(calendarId='primary', body=event).execute()
    return result.get('id')


def update_calendar_event(
    service,
    event_id: str,
    title: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    description: Optional[str] = None,
    timezone: str = "America/Chicago",
) -> str:
    """Update an existing calendar event. Returns the updated event ID."""
    event = service.events().get(calendarId='primary', eventId=event_id).execute()

    if title:
        event['summary'] = title
    if start_time:
        event['start'] = {'dateTime': start_time.isoformat(), 'timeZone': timezone}
    if end_time:
        event['end'] = {'dateTime': end_time.isoformat(), 'timeZone': timezone}
    if description:
        event['description'] = description

    updated = service.events().update(
        calendarId='primary', eventId=event_id, body=event
    ).execute()
    return updated.get('id')


def delete_calendar_event(service, event_id: str):
    """Delete an event from Google Calendar."""
    service.events().delete(calendarId='primary', eventId=event_id).execute()


# ─── Drive / Docs Operations ──────────────────────────────────────────

def create_drive_doc(service, title: str) -> str:
    """Create an empty Google Doc and return its URL."""
    file_metadata = {
        'name': title,
        'mimeType': 'application/vnd.google-apps.document'
    }
    doc = service.files().create(body=file_metadata, fields='id').execute()
    return f"https://docs.google.com/document/d/{doc.get('id')}"


def create_templated_doc(
    drive_service,
    docs_service,
    title: str,
    outline_content: str
) -> str:
    """
    Create a Google Doc and populate it with AI-generated outline content.
    Returns the document URL.
    """
    # 1. Create the doc
    file_metadata = {
        'name': title,
        'mimeType': 'application/vnd.google-apps.document'
    }
    doc = drive_service.files().create(body=file_metadata, fields='id').execute()
    doc_id = doc.get('id')

    # 2. Write the outline into the doc body
    if outline_content:
        requests = [{
            'insertText': {
                'location': {'index': 1},
                'text': outline_content
            }
        }]
        docs_service.documents().batchUpdate(
            documentId=doc_id, body={'requests': requests}
        ).execute()

    return f"https://docs.google.com/document/d/{doc_id}"


def format_events_for_context(events: List[Dict]) -> str:
    """Format calendar events into a human-readable string for Gemini context."""
    if not events:
        return "No events scheduled today."

    lines = []
    for ev in events:
        start = ev.get('start', {}).get('dateTime', ev.get('start', {}).get('date', '?'))
        end = ev.get('end', {}).get('dateTime', ev.get('end', {}).get('date', '?'))
        summary = ev.get('summary', 'Untitled')
        # Extract just time portion
        try:
            s = datetime.fromisoformat(start.replace('Z', '+00:00')).strftime('%I:%M %p')
            e = datetime.fromisoformat(end.replace('Z', '+00:00')).strftime('%I:%M %p')
            lines.append(f"- {s} to {e}: {summary}")
        except (ValueError, TypeError):
            lines.append(f"- {summary}")

    return "\n".join(lines)


# ─── Gmail Operations ──────────────────────────────────────────────────

def create_email_draft(gmail_service, subject: str, body: str, to: Optional[str] = None) -> str:
    """Create a Gmail draft and return its URL."""
    from email.message import EmailMessage
    import base64

    message = EmailMessage()
    message.set_content(body)
    if to:
        message['To'] = to
    message['Subject'] = subject

    # Base64url encode the message
    encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
    draft = {
        'message': {
            'raw': encoded_message
        }
    }

    try:
        created_draft = gmail_service.users().drafts().create(userId='me', body=draft).execute()
        draft_id = created_draft['id']
        return f"https://mail.google.com/mail/#drafts?compose={draft_id}"
    except Exception as e:
        print(f"⚠️ Failed to create Gmail draft: {e}")
        raise e
