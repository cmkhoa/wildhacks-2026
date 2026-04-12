from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
import os
import httpx
from typing import Optional
from datetime import datetime, timedelta
from models import User

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
REDIRECT_URI = os.environ.get("REDIRECT_URI", "http://localhost:8080/auth/callback")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/gmail.compose"
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
    """Exchanges code for tokens, fetches user info, persists to DB."""
    if error:
        raise HTTPException(status_code=400, detail=f"Google Auth Error: {error}")

    # 1. Exchange code for tokens
    token_url = "https://oauth2.googleapis.com/token"
    payload = {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code"
    }

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(token_url, data=payload)

    if token_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch tokens from Google")

    tokens = token_resp.json()
    access_token = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    expires_in = tokens.get("expires_in", 3600)

    # 2. Fetch user info (email) from Google
    async with httpx.AsyncClient() as client:
        userinfo_resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )

    if userinfo_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch user info")

    userinfo = userinfo_resp.json()
    email = userinfo.get("email")

    # 3. Upsert user in MongoDB
    try:
        user = await User.find_one({"email": email})
        if user:
            user.access_token = access_token
            if refresh_token:  # Google only sends refresh_token on first consent
                user.refresh_token = refresh_token
            user.token_expiry = datetime.utcnow() + timedelta(seconds=expires_in)
            await user.save()
        else:
            user = User(
                email=email,
                access_token=access_token,
                refresh_token=refresh_token,
                token_expiry=datetime.utcnow() + timedelta(seconds=expires_in),
            )
            await user.insert()
    except Exception as e:
        print(f"⚠️  DB upsert skipped: {e}")

    # 4. Redirect to frontend with email as session identifier
    frontend_redirect = f"{FRONTEND_URL}/dashboard?auth=success&email={email}"
    return RedirectResponse(frontend_redirect)


@router.get("/me")
async def get_current_user(email: str):
    """Returns the current user's profile from the DB."""
    try:
        user = await User.find_one({"email": email})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return {
            "email": user.email,
            "reward_points": user.reward_points,
            "grace_passes": user.grace_passes,
            "time_deviation_ratio": user.time_deviation_ratio,
            "current_streak": getattr(user, "current_streak", 0),
            "longest_streak": getattr(user, "longest_streak", 0),
            "previous_streak": getattr(user, "previous_streak", 0),
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Database unavailable")
