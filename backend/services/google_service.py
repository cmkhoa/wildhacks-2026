import os
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import datetime

def get_calendar_service(access_token: str, refresh_token: str):
    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.environ.get("GOOGLE_CLIENT_ID"),
        client_secret=os.environ.get("GOOGLE_CLIENT_SECRET"),
    )
    return build('calendar', 'v3', credentials=creds)

def get_drive_service(access_token: str, refresh_token: str):
    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.environ.get("GOOGLE_CLIENT_ID"),
        client_secret=os.environ.get("GOOGLE_CLIENT_SECRET"),
    )
    return build('drive', 'v3', credentials=creds)

def create_calendar_event(service, title: str, start_time: datetime.datetime, duration_minutes: int, description: str=""):
    end_time = start_time + datetime.timedelta(minutes=duration_minutes)
    
    event = {
        'summary': title,
        'description': description,
        'start': {
            'dateTime': start_time.isoformat(),
        },
        'end': {
            'dateTime': end_time.isoformat(),
        },
    }
    event = service.events().insert(calendarId='primary', body=event).execute()
    return event.get('id')

def create_drive_doc(service, title: str, content: str = ""):
    file_metadata = {
        'name': title,
        'mimeType': 'application/vnd.google-apps.document'
    }
    # Google docs API or drive API allows creating empty docs very easily
    doc = service.files().create(body=file_metadata, fields='id').execute()
    return f"https://docs.google.com/document/d/{doc.get('id')}"
