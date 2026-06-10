from contextlib import asynccontextmanager
from pathlib import Path
import asyncio
import logging
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.config import settings
from app.database import init_models
from app.routes import agents, auth, billing, calls, dashboard, payments, vapi_webhooks, webhooks
from app.startup_check import check_all_services
from app.services.redis_client import ping_redis
from app.services.synthesis import cleanup_audio_files
from app.services.synthesis import AUDIO_DIR, delete_file_later

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("harkly")


@asynccontextmanager
async def lifespan(_: FastAPI):
    check_all_services()
    settings.validate_startup()
    settings.log_service_checklist()

    if settings.DATABASE_URL:
        try:
            await init_models()
            logger.info("Database tables ensured.")
        except Exception:  # pragma: no cover
            logger.exception("Failed to initialize database tables")
    else:
        logger.warning("DATABASE_URL is not set; DB-backed routes will return 500.")

    cleanup_task = asyncio.create_task(_audio_cleanup_loop())
    if settings.REDIS_URL:
        logger.info("Redis reachable=%s", "yes" if await ping_redis() else "no")

    try:
        yield
    finally:
        cleanup_task.cancel()


async def _audio_cleanup_loop() -> None:
    while True:
        try:
            await cleanup_audio_files()
        except Exception:
            logger.exception("Audio cleanup failed")
        await asyncio.sleep(1800)


app = FastAPI(
    title="Harkly AI API",
    description="The voice AI receptionist that answers your business calls.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")

allowed_origins = ["http://localhost:3000", "http://127.0.0.1:3000", "https://oneclerk.ai"]
if settings.FRONTEND_URL:
    allowed_origins.append(settings.FRONTEND_URL)
import os as _os
_replit_domain = _os.environ.get("REPLIT_DEV_DOMAIN")
if _replit_domain:
    allowed_origins.append(f"https://{_replit_domain}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "An unexpected error occurred. Please try again."})

app.include_router(webhooks.router)
app.include_router(auth.router, prefix="/api")
app.include_router(agents.router, prefix="/api")
app.include_router(calls.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(billing.router, prefix="/api")
app.include_router(payments.router, prefix="/api")
app.include_router(vapi_webhooks.router)

_STATIC_DIR = Path(__file__).parent / "static"
_HAS_STATIC = _STATIC_DIR.exists()

_NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}

# Serve critical JS/CSS files with no-cache so the browser always gets the latest version
_NO_CACHE_STATIC = {"app.js", "styles.css"}


@app.api_route("/static/{filename:path}", methods=["GET", "HEAD"], include_in_schema=False)
async def static_files(filename: str):
    if not _HAS_STATIC:
        raise HTTPException(404)
    path = _STATIC_DIR / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(404)
    # Strip query params from filename (e.g. app.js?v=106 → app.js)
    base = filename.split("?")[0].rsplit("/", 1)[-1]
    headers = _NO_CACHE_HEADERS if base in _NO_CACHE_STATIC else {}
    media_types = {
        ".js": "application/javascript",
        ".css": "text/css",
        ".html": "text/html",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".woff2": "font/woff2",
        ".woff": "font/woff",
    }
    suffix = path.suffix.lower()
    return FileResponse(path, headers=headers, media_type=media_types.get(suffix))


@app.get("/", include_in_schema=False)
async def root():
    if _HAS_STATIC:
        return FileResponse(_STATIC_DIR / "index.html", headers=_NO_CACHE_HEADERS)
    return {
        "product": "Harkly AI",
        "tagline": "Your phone rings. Harkly AI handles it.",
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/app", include_in_schema=False)
async def dashboard_app():
    if _HAS_STATIC:
        return FileResponse(_STATIC_DIR / "index.html", headers=_NO_CACHE_HEADERS)
    return {"detail": "frontend not bundled"}


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)


@app.get("/login", include_in_schema=False)
@app.get("/signup", include_in_schema=False)
@app.get("/dashboard", include_in_schema=False)
@app.get("/verify-email", include_in_schema=False)
@app.get("/privacy", include_in_schema=False)
async def spa_fallback():
    if _HAS_STATIC:
        return FileResponse(_STATIC_DIR / "index.html", headers=_NO_CACHE_HEADERS)
    return {"detail": "frontend not bundled"}


_PRIVACY_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Privacy Policy — Harkly AI</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:860px;margin:0 auto;padding:48px 24px;color:#1a1a2e;line-height:1.7}
  h1{font-size:2rem;margin-bottom:.25rem}
  h2{font-size:1.3rem;margin-top:2.5rem;border-bottom:1px solid #e5e7eb;padding-bottom:.5rem}
  h3{font-size:1.05rem;margin-top:1.5rem}
  table{width:100%;border-collapse:collapse;font-size:.9rem;margin:1rem 0}
  th,td{text-align:left;padding:10px 14px;border:1px solid #e5e7eb}
  th{background:#f9fafb;font-weight:600}
  .badge{display:inline-block;background:#eef2ff;color:#4338ca;padding:2px 10px;border-radius:999px;font-size:.8rem;margin-bottom:1rem}
  .note{background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:14px 18px;margin:1rem 0;font-size:.9rem}
  a{color:#4f46e5}
  footer{margin-top:4rem;font-size:.85rem;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:1.5rem}
</style>
</head>
<body>
<span class="badge">Legal &amp; Compliance</span>
<h1>Privacy Policy</h1>
<p><strong>Harkly AI (OneClerk)</strong> — Last updated: June 10, 2025</p>
<p>This policy explains what data Harkly AI collects, why, and how it is protected. We keep this document plain and specific.</p>

<h2>1. Overview</h2>
<p>Harkly AI operates <a href="https://harkly.in">harkly.in</a> and the Harkly AI voice receptionist platform. This policy applies to all data processed through our web application, mobile interfaces, and telephony integrations.</p>

<h2>2. Data Ingestion — Voice &amp; Microphone</h2>
<div class="note">Harkly captures microphone audio streams exclusively via real-time, encrypted WebRTC channels (DTLS-SRTP). Audio is processed in-transit and is never written to permanent storage.</div>
<h3>What we capture</h3>
<ul>
  <li>Live microphone input during an active AI call, transmitted over a secure WebRTC peer-to-peer channel.</li>
  <li>Transcribed text from your speech, used solely to generate an AI response in that session.</li>
  <li>Session metadata (timestamps, call duration) for billing and quality purposes.</li>
</ul>
<h3>What we never capture</h3>
<ul>
  <li>Raw audio recordings are <strong>not</strong> persisted to disk, databases, or cloud storage after a call ends.</li>
  <li>We do not use voiceprints, biometrics, or speaker-identification technology.</li>
  <li>We do not share audio streams or transcripts with advertising or analytics third parties.</li>
</ul>
<h3>Telephony calls (PSTN)</h3>
<p>For inbound phone calls, audio is processed in real-time through our telephony partner (Telnyx) under SOC 2-aligned infrastructure. Short-lived audio segments are deleted within 30 minutes of call completion.</p>

<h2>3. Google Integration Scopes</h2>
<div class="note">We request only the minimum OAuth scopes necessary. We do not request, store, or process Google data beyond what is described below.</div>
<h3>Google Calendar</h3>
<table>
  <tr><th>Scope</th><th>Purpose &amp; Limitation</th></tr>
  <tr>
    <td>https://www.googleapis.com/auth/calendar.events</td>
    <td>Used <strong>exclusively</strong> to create, read, update, and delete calendar events on the user's behalf when their AI agent books or modifies appointments. We never read personal calendar events unrelated to Harkly bookings.</td>
  </tr>
  <tr>
    <td>https://www.googleapis.com/auth/calendar.readonly</td>
    <td>Used <strong>only</strong> to check existing bookings and available time slots to avoid double-booking. Slot data is held in-memory during the call session and not persisted.</td>
  </tr>
</table>
<h3>Gmail</h3>
<table>
  <tr><th>Scope</th><th>Purpose &amp; Limitation</th></tr>
  <tr>
    <td>https://www.googleapis.com/auth/gmail.send</td>
    <td>Used <strong>exclusively</strong> to send appointment confirmation and reminder emails to callers on behalf of the business. We never read, index, or analyse existing emails in the connected inbox.</td>
  </tr>
</table>
<h3>Google data usage rules</h3>
<ul>
  <li>Google user data is used only to operate the features described above.</li>
  <li>We do not transfer Google user data to third parties except as necessary to provide the Service.</li>
  <li>We do not use Google user data for advertising or profiling.</li>
  <li>We comply with the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements.</li>
</ul>

<h2>4. Data Safeguards &amp; No-Sale Commitment</h2>
<ul>
  <li><strong>Zero data selling:</strong> User audio recordings, transcripts, and personal profile details are never sold, rented, or shared with outside marketing networks — ever.</li>
  <li><strong>Encryption in transit:</strong> All data uses TLS 1.2+ or DTLS-SRTP (WebRTC audio).</li>
  <li><strong>Encryption at rest:</strong> Database records are stored in encrypted PostgreSQL instances. Passwords are hashed with bcrypt.</li>
  <li><strong>Minimal access:</strong> Internal team access follows least-privilege principles with quarterly audits.</li>
  <li><strong>SOC 2-aligned partners:</strong> Infrastructure partners (Telnyx, ElevenLabs, OpenAI) operate under SOC 2 Type II or equivalent certifications.</li>
</ul>

<h2>5. Data Retention</h2>
<table>
  <tr><th>Data Type</th><th>Retention Period</th></tr>
  <tr><td>Raw audio segments (telephony)</td><td>Deleted within 30 minutes of call end</td></tr>
  <tr><td>Call transcripts</td><td>90 days, then anonymised</td></tr>
  <tr><td>Account profile data</td><td>Until account deletion + 30-day grace period</td></tr>
  <tr><td>Billing / invoice records</td><td>7 years (legal/tax obligation)</td></tr>
  <tr><td>Google Calendar event data</td><td>Not stored — fetched live per request</td></tr>
  <tr><td>Google OAuth refresh tokens</td><td>Until user revokes access or deletes agent</td></tr>
</table>

<h2>6. Your Rights</h2>
<p>You may access, correct, delete, or port your personal data. You may revoke Google OAuth access at any time from your <a href="https://myaccount.google.com/permissions">Google Account permissions page</a>. Email <a href="mailto:privacy@harkly.in">privacy@harkly.in</a> for any data requests. We respond within 30 days.</p>

<h2>7. Cookies &amp; Tracking</h2>
<p>We use strictly necessary session cookies and minimal aggregate analytics (no cross-site tracking). We do not use advertising cookies or fingerprinting scripts.</p>

<h2>8. Children's Privacy</h2>
<p>The Service is not directed at children under 13 (or 16 in the EU/UK). Contact <a href="mailto:privacy@harkly.in">privacy@harkly.in</a> if you believe a child has provided us data.</p>

<h2>9. Changes to This Policy</h2>
<p>Material changes will be notified via email or in-app banner at least 14 days before taking effect.</p>

<h2>10. Contact</h2>
<p>Harkly AI (OneClerk) — <a href="mailto:privacy@harkly.in">privacy@harkly.in</a> — <a href="https://harkly.in">harkly.in</a></p>

<footer>&copy; 2025 Harkly AI (OneClerk). All rights reserved.</footer>
</body>
</html>"""


@app.get("/api/v1/privacy", include_in_schema=True, tags=["compliance"])
@app.get("/policy", include_in_schema=False)
async def privacy_policy_html():
    """
    Public, unauthenticated endpoint serving the Harkly AI Privacy Policy as HTML.
    Readable by automated scrapers and Google OAuth verification bots.
    """
    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=_PRIVACY_HTML, status_code=200, headers={
        "Cache-Control": "public, max-age=3600",
        "X-Robots-Tag": "index, follow",
    })


@app.get("/api", include_in_schema=False)
async def api_info() -> dict:
    return {
        "product": "Harkly AI",
        "tagline": "Your phone rings. Harkly AI handles it.",
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "product": "Harkly AI",
        "services": settings.service_checklist(),
    }


class DemoChatPayload(BaseModel):
    message: str
    agent_type: str = "Dental clinic front desk"
    language: str = "English (US)"


_DEMO_FALLBACKS = {
    "Dental clinic front desk": "Thanks for calling! I can help you schedule a cleaning, look up your insurance, or transfer you to the doctor. What works best for you?",
    "Hair salon receptionist": "Hey there! Happy to book you in with your stylist, or set you up with someone new. Which would you prefer?",
    "Restaurant host": "Great evening to call! I can get you a table reservation or walk you through tonight's specials. What can I do for you?",
    "HVAC dispatcher": "Thanks for calling! Is this an emergency repair or would you like to schedule a tune-up? I'll get a tech sorted for you.",
    "Law firm intake": "Thank you for reaching out. Can you give me a brief overview of your matter so I can route you to the right attorney?",
}

_DEMO_SYSTEM = (
    "You are {agent_type}, a friendly AI receptionist powered by Harkly AI. "
    "Respond in {language} if it's not English. "
    "Keep your reply to 1–2 natural sentences, warm and professional. "
    "Do not mention you are an AI unless asked."
)


@app.post("/api/demo-chat", include_in_schema=False)
async def demo_chat(payload: DemoChatPayload) -> dict:
    api_key = os.getenv("OPENAI_API_KEY")
    if api_key and payload.message.strip():
        try:
            import openai  # type: ignore
            client = openai.AsyncOpenAI(api_key=api_key)
            system = _DEMO_SYSTEM.format(
                agent_type=payload.agent_type,
                language=payload.language,
            )
            resp = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": payload.message},
                ],
                max_tokens=130,
                temperature=0.75,
            )
            return {"response": resp.choices[0].message.content.strip()}
        except Exception:
            logger.exception("demo-chat OpenAI call failed, using fallback")

    fallback = _DEMO_FALLBACKS.get(payload.agent_type, "How can I help you today?")
    return {"response": fallback}


@app.get("/api/audio/{filename}", include_in_schema=False)
async def serve_audio(filename: str) -> FileResponse:
    safe = Path(filename).name
    path = AUDIO_DIR / safe
    # Accept both .wav (µ-law, preferred) and legacy .mp3 files
    if not path.exists() or not (safe.endswith(".wav") or safe.endswith(".mp3")):
        raise HTTPException(404, "audio not found")
    media_type = "audio/wav" if safe.endswith(".wav") else "audio/mpeg"
    asyncio.create_task(delete_file_later(safe, delay_seconds=1800))
    return FileResponse(
        path,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=3600"},
    )
