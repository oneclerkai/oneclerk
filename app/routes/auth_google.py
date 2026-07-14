from __future__ import annotations

from fastapi import APIRouter, Request
from urllib.parse import urlencode

from app.config import settings

router = APIRouter()


@router.get("/api/auth/google/redirect")
async def google_redirect(request: Request, agent_id: str | None = None):
    """Return a Google OAuth2 authorization URL.

    Query params:
      - agent_id (optional): when provided, the flow will link the returned refresh token to that agent.
    """
    base = "https://accounts.google.com/o/oauth2/v2/auth"
    redirect_uri = (settings.BACKEND_URL or settings.PUBLIC_BASE_URL or "") + "/api/auth/google/callback"
    if not redirect_uri:
        # Fallback to localhost path
        redirect_uri = "http://localhost:5000/api/auth/google/callback"

    # state encodes whether this is a login or agent connect. Use simple prefix.
    state = f"agent:{agent_id}" if agent_id else "login"

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile https://www.googleapis.com/auth/calendar",
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    url = base + "?" + urlencode(params)
    return {"url": url}
