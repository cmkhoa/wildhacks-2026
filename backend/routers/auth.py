from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
import os
import httpx
from typing import Optional

router = APIRouter(prefix="/auth", tags=["auth"])

# In a real app these would come from env vars
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "YOUR_GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "YOUR_GOOGLE_CLIENT_SECRET")
REDIRECT_URI = os.environ.get("REDIRECT_URI", "http://localhost:8000/auth/callback")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/drive.file"
]

@router.get("/login")
def login_via_google():
    """Redirects the user to Google's OAuth consent screen."""
    scope_str = " ".join(SCOPES)
    auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"response_type=code&"
        f"client_id={GOOGLE_CLIENT_ID}&"
        f"redirect_uri={REDIRECT_URI}&"
        f"scope={scope_str}&"
        f"access_type=offline&"
        f"prompt=consent"
    )
    return RedirectResponse(auth_url)

@router.get("/callback")
async def google_callback(code: str, error: Optional[str] = None):
    """Handles the callback from Google, exchanges code for tokens, and creates/finds the user."""
    if error:
        raise HTTPException(status_code=400, detail=f"Google Auth Error: {error}")
    
    token_url = "https://oauth2.googleapis.com/token"
    payload = {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(token_url, data=payload)
        
    if response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch tokens from Google")
        
    tokens = response.json()
    access_token = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    id_token = tokens.get("id_token")
    
    # In a full setup, we would:
    # 1. Decode the id_token or hit Google UserInfo API to get email
    # 2. Add/Find the User in the DB
    # 3. Save the refresh_token encrypted.
    # 4. Generate an App JWT token and redirect to frontend ?token=XX
    
    # Placeholder redirect to frontend with success
    frontend_redirect = f"{FRONTEND_URL}/dashboard?auth=success"
    return RedirectResponse(frontend_redirect)
