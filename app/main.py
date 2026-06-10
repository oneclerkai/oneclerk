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
async def spa_fallback():
    if _HAS_STATIC:
        return FileResponse(_STATIC_DIR / "index.html", headers=_NO_CACHE_HEADERS)
    return {"detail": "frontend not bundled"}


_PRIVACY_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Privacy Policy — Harkly</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#f8f9fa;color:#1a1a2e;line-height:1.75}
.wrap{max-width:860px;margin:0 auto;padding:56px 24px 80px}
header{display:flex;align-items:center;justify-content:space-between;margin-bottom:48px;padding-bottom:20px;border-bottom:1px solid #e5e7eb}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none;color:#1a1a2e}
.logo-mark{width:36px;height:36px;background:linear-gradient(135deg,#6366f1,#4f46e5);border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:13px}
.logo-name{font-size:18px;font-weight:700}
.effective{font-size:13px;color:#6b7280}
h1{font-size:2.2rem;font-weight:800;letter-spacing:-0.03em;margin-bottom:6px}
.subtitle{font-size:1.05rem;color:#4b5563;margin-bottom:40px;max-width:600px}
.toc{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:22px 26px;margin-bottom:48px}
.toc h2{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#9ca3af;margin-bottom:12px}
.toc ol{padding-left:18px;space-y:4px}
.toc li{margin-bottom:6px}
.toc a{color:#4f46e5;text-decoration:none;font-size:.9rem}
.toc a:hover{text-decoration:underline}
section{margin-bottom:48px}
.sec-head{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.sec-num{width:32px;height:32px;background:#eef2ff;color:#4f46e5;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;flex-shrink:0}
h2.sec-title{font-size:1.35rem;font-weight:700;color:#111827}
h3{font-size:1rem;font-weight:600;color:#111827;margin:20px 0 8px}
p{color:#374151;margin-bottom:12px;font-size:.95rem}
ul,ol{padding-left:22px;margin-bottom:12px}
li{color:#374151;font-size:.95rem;margin-bottom:6px}
.callout{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin:16px 0;font-size:.9rem;color:#92400e}
.callout.blue{background:#eff6ff;border-color:#bfdbfe;color:#1e40af}
.callout.green{background:#f0fdf4;border-color:#bbf7d0;color:#166534}
table{width:100%;border-collapse:collapse;font-size:.88rem;margin:14px 0;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb}
th{background:#f9fafb;text-align:left;padding:11px 16px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb}
td{padding:11px 16px;border-bottom:1px solid #f3f4f6;color:#4b5563;vertical-align:top}
tr:last-child td{border-bottom:none}
code{font-family:monospace;font-size:.8rem;background:#f3f4f6;padding:2px 6px;border-radius:4px;color:#4338ca}
hr{border:none;border-top:1px solid #e5e7eb;margin:40px 0}
footer{text-align:center;font-size:.82rem;color:#9ca3af;padding-top:24px;border-top:1px solid #e5e7eb}
a{color:#4f46e5}
@media(max-width:600px){h1{font-size:1.6rem}.wrap{padding:32px 16px 60px}}
</style>
</head>
<body>
<div class="wrap">

  <header>
    <a class="logo" href="https://harkly.in">
      <div class="logo-mark">H</div>
      <span class="logo-name">Harkly</span>
    </a>
    <span class="effective">Effective Date: June 10, 2026</span>
  </header>

  <h1>Privacy Policy</h1>
  <p class="subtitle">Welcome to Harkly, hosted at <a href="https://harkly.in">harkly.in</a>. We are committed to protecting your privacy and handling your data with absolute security and transparency.</p>

  <div class="toc">
    <h2>Contents</h2>
    <ol>
      <li><a href="#s1">Data Ingestion and Processing</a></li>
      <li><a href="#s2">Google OAuth API Scope Disclosures</a></li>
      <li><a href="#s3">Data Protection and Third-Party Sub-Processors</a></li>
      <li><a href="#s4">Data Retention and Deletion Rights</a></li>
      <li><a href="#s5">Contact Information</a></li>
    </ol>
  </div>

  <section id="s1">
    <div class="sec-head">
      <div class="sec-num">1</div>
      <h2 class="sec-title">Data Ingestion and Processing</h2>
    </div>

    <h3>A. Real-Time Voice and Audio Processing</h3>
    <p>Harkly provides real-time voice automation tools. When you engage with our voice agents via telephone or web browsers, our systems capture and process voice metadata streams using secure WebRTC (Web Real-Time Communication) wrappers.</p>
    <ul>
      <li>Audio streams are captured solely to synthesize, transcribe, and process conversational input into textual commands via secure API integrations.</li>
      <li>Voice data processed through our Vapi or OpenRouter network nodes is strictly <strong>transient</strong>. We do not store, retain, or compile raw audio files or audio recordings for marketing, tracking, or profiling purposes.</li>
    </ul>
    <div class="callout blue">
      <strong>Key commitment:</strong> No raw audio recordings are ever written to permanent storage. All voice data is processed in-transit over encrypted WebRTC (DTLS-SRTP) channels and discarded immediately after transcription.
    </div>

    <h3>B. User Profile and Registration Data</h3>
    <p>During signup, we collect user credentials, including username, encrypted password hashes, and a verified email address. This data is handled via secure JWT validation keys and encrypted databases to verify account status and access boundaries.</p>
  </section>

  <hr>

  <section id="s2">
    <div class="sec-head">
      <div class="sec-num">2</div>
      <h2 class="sec-title">Google OAuth API Scope Disclosures</h2>
    </div>
    <p>To provide cross-channel workflow automation, Harkly requests explicit, user-authorized permissions via Google API OAuth scopes. Our usage of these scopes is strictly restricted as detailed below.</p>

    <h3>A. Google Calendar API Access</h3>
    <p>Harkly requests access to your Google Calendar to read availability and programmatically schedule, modify, or delete calendar consultation appointments explicitly requested by you or your calling customers.</p>
    <table>
      <tr><th>Scope</th><th>Purpose</th></tr>
      <tr>
        <td><code>calendar.events</code></td>
        <td>Create, update, and delete booking appointments on behalf of the business owner when their AI agent handles a call.</td>
      </tr>
      <tr>
        <td><code>calendar.readonly</code></td>
        <td>Read existing availability and booked slots to avoid double-booking. Data is held in-memory per session only.</td>
      </tr>
    </table>

    <h3>B. Gmail API Access</h3>
    <p>Harkly requests access to your Gmail infrastructure solely to dispatch direct automation status updates, transactional confirmations, and appointment summaries on your behalf.</p>
    <table>
      <tr><th>Scope</th><th>Purpose</th></tr>
      <tr>
        <td><code>gmail.send</code></td>
        <td>Send appointment confirmation and reminder emails to callers on behalf of the business. We never read, index, or analyse any existing emails in the connected inbox.</td>
      </tr>
    </table>

    <h3>C. Limited Use Compliance Statement</h3>
    <div class="callout green">
      Harkly's use and transfer of information received from Google APIs to any other app will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements. We do not under any circumstances sell, lease, or transfer your Google user data to external advertising tracking companies or third-party data brokers.
    </div>
  </section>

  <hr>

  <section id="s3">
    <div class="sec-head">
      <div class="sec-num">3</div>
      <h2 class="sec-title">Data Protection and Third-Party Sub-Processors</h2>
    </div>
    <p>We share limited, relevant data payloads with reputable infrastructure providers strictly necessary to execute our application services:</p>
    <table>
      <tr><th>Provider</th><th>Role</th><th>Data Shared</th></tr>
      <tr>
        <td><strong>Railway / PostgreSQL</strong></td>
        <td>Database Infrastructure</td>
        <td>Core data profiles securely hosted via encrypted database networks.</td>
      </tr>
      <tr>
        <td><strong>Deepgram</strong></td>
        <td>Telephony &amp; Transcription</td>
        <td>Real-time speech-to-text via isolated low-latency AI models. No audio is retained.</td>
      </tr>
      <tr>
        <td><strong>Resend</strong></td>
        <td>Email &amp; Notifications</td>
        <td>Operational messaging and onboarding triggers securely routed for delivery only.</td>
      </tr>
      <tr>
        <td><strong>Telnyx / Vapi</strong></td>
        <td>Telephony</td>
        <td>Live call routing. Audio segments deleted within 30 minutes of call end.</td>
      </tr>
    </table>
    <p>Each sub-processor is contractually bound to data protection standards equivalent to those described in this policy. None are authorised to use your data for their own marketing or analytical purposes.</p>
  </section>

  <hr>

  <section id="s4">
    <div class="sec-head">
      <div class="sec-num">4</div>
      <h2 class="sec-title">Data Retention and Deletion Rights</h2>
    </div>
    <p>You retain full ownership of your data parameters. You may request the absolute deletion of your user profile record, active agents, or integration connection keys at any time by contacting us at <a href="mailto:support@harkly.in">support@harkly.in</a>. Upon verification, all corresponding application records will be purged permanently from our active database within <strong>30 business days</strong>.</p>
    <table>
      <tr><th>Data Type</th><th>Retention Period</th></tr>
      <tr><td>Raw audio segments</td><td>Deleted within 30 minutes of call end</td></tr>
      <tr><td>Call transcripts</td><td>90 days, then permanently anonymised</td></tr>
      <tr><td>Account profile &amp; agent config</td><td>Until account deletion + 30-day grace period</td></tr>
      <tr><td>Billing &amp; invoice records</td><td>7 years (statutory tax obligation)</td></tr>
      <tr><td>Google Calendar event data</td><td>Not stored — fetched live per request only</td></tr>
      <tr><td>Google OAuth refresh tokens</td><td>Until user revokes access or deletes connected agent</td></tr>
    </table>
  </section>

  <hr>

  <section id="s5">
    <div class="sec-head">
      <div class="sec-num">5</div>
      <h2 class="sec-title">Contact Information</h2>
    </div>
    <p>For questions, clarifications, or data removal requests regarding our compliance protocols, please reach out directly via:</p>
    <div class="callout">
      <strong>Email:</strong> <a href="mailto:support@harkly.in">support@harkly.in</a><br>
      <strong>Corporate Portal:</strong> <a href="https://harkly.in">https://harkly.in</a>
    </div>
  </section>

  <footer>
    &copy; 2026 Harkly. All rights reserved. &nbsp;·&nbsp;
    <a href="https://harkly.in">harkly.in</a>
  </footer>

</div>
</body>
</html>"""


@app.get("/privacy", include_in_schema=False)
@app.get("/api/v1/privacy", include_in_schema=True, tags=["compliance"])
@app.get("/policy", include_in_schema=False)
async def privacy_policy_html():
    """
    Public, unauthenticated endpoint serving the Harkly Privacy Policy as HTML.
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
