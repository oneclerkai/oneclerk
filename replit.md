# OneClerk — Voice AI Receptionist Platform

## Overview

OneClerk is a voice AI receptionist SaaS platform. When a business owner can't answer their phone, calls are forwarded to a OneClerk number, where the AI answers, handles common questions, books appointments, detects urgency, and sends WhatsApp summaries to the owner.

**Target customers:** Clinics, hotels, restaurants, salons, gyms, offices, legal practices.

**Core flow:** Caller dials business → conditional call forwarding triggers → OneClerk number receives call → Telnyx handles telephony → Deepgram transcribes speech → OpenAI GPT-4o-mini generates response → ElevenLabs synthesizes voice → summary sent via WhatsApp.

The project lives inside the `oneclerk/` subdirectory. The root `main.py` is a Replit placeholder and is not used by the application.

---

## User Preferences

Preferred communication style: Simple, everyday language.

---

## System Architecture

### Backend (Python/FastAPI)

- **Framework:** FastAPI with async/await throughout, running on Uvicorn (port 5000 in Replit, `$PORT` on Railway)
- **Entry point:** `oneclerk/app/main.py` — wires routers, CORS middleware, lifespan startup (runs `init_models()` to auto-create DB tables)
- **Config:** `oneclerk/app/config.py` uses `pydantic-settings` — all config comes from environment variables, everything defaults gracefully so the app starts without any keys set
- **Database:** Async SQLAlchemy 2.x with `asyncpg` driver against PostgreSQL. `DATABASE_URL` is auto-detected; the app patches `postgresql://` to `postgresql+asyncpg://` and strips incompatible `sslmode` params
- **Auth:** JWT tokens (`python-jose`) + bcrypt password hashing. `OAuth2PasswordBearer` extracts tokens; `get_current_user` dependency validates them. Google OAuth callback flow also supported
- **Background tasks:** Celery with Redis as both broker and backend. Used for async WhatsApp sends and post-call processing
- **Rate limiting:** `slowapi` is in requirements (not yet wired in all routes)

### Route/API Structure

There are **two parallel route trees** — an older `app/routes/` set and a newer `app/api/` set. Both are registered in `main.py`. This is a known duplication that should be consolidated.

| Prefix | File | Purpose |
|---|---|---|
| `/auth` | `api/auth.py` | Signup, login, `/me`, onboarding completion |
| `/agents` | `api/agents.py` | CRUD agents, activate/deactivate, test chat |
| `/calls` | `api/calls.py` + `routes/calls.py` | Call history; Twilio webhooks for the voice loop |
| `/dashboard` | `api/dashboard.py` | Stats aggregation for dashboard cards |
| `/billing` | `api/billing.py` + `routes/billing.py` | Stripe checkout, plans, subscription status |
| `/integrations` | `api/integrations.py` | Google Calendar connect/status stubs |
| `/webhooks` | `api/webhooks.py` + `routes/webhooks.py` | Telnyx call events, Stripe billing events, WhatsApp inbound |

### Database Models

All models use SQLAlchemy's `Mapped`/`mapped_column` declarative style with UUID primary keys:

- **User** — email, password_hash, Google OAuth tokens, subscription tier (trial/starter/growth/scale), Stripe customer ID, onboarding flag
- **Agent** — belongs to User, holds `business_context` JSON (all business config), ElevenLabs `voice_id`, language enum, Telnyx phone number, escalation config
- **Call** — belongs to Agent + User, stores Telnyx call SID, duration, status enum, escalation flag, summary text, appointment details JSON
- **ConversationTurn** — per-turn transcripts for a Call (user/assistant roles)
- **Integration** — stores OAuth tokens for Google Calendar per user/agent
- **Contact** — deduplicated caller records with call count

### Voice Call Flow

1. **Incoming call** hits `/calls/incoming` (Twilio TwiML) or Telnyx webhook
2. Agent looked up by phone number; business context loaded
3. **Transcription:** Deepgram Nova-2 (`app/services/transcription.py`)
4. **AI response:** OpenAI GPT-4o-mini (`app/services/ai_brain.py`) — language auto-detected from character sets (Hindi/Tamil/Telugu/Malayalam/Arabic/Bengali/Kannada), system prompt chosen per language
5. **Speech synthesis:** ElevenLabs (`app/services/voice_engine.py`) with on-disk MP3 caching in `/tmp/oneclerk_audio`; falls back to Twilio Polly if no key
6. **Urgency/booking detection:** keyword-based escalation triggers, Calendly link delivery, WhatsApp summary to owner

### Frontend

Two frontend layers exist:

1. **Embedded SPA** (`app/static/`) — vanilla JS + Lucide icons + custom CSS served directly from FastAPI at `/app`. No build step. Hash-based router. Used for lightweight access without Next.js
2. **Next.js app** (`frontend/src/`) — React + TypeScript + Tailwind + Zustand state management + axios. Dashboard, agents, calls, integrations, settings pages. Auth stored in localStorage via Zustand `persist`. Communicates with backend via `NEXT_PUBLIC_API_URL`

The Next.js frontend is not yet built/deployed — it exists as source only.

### Key Design Decisions

- **Graceful degradation:** Every external service (OpenAI, ElevenLabs, Telnyx, Stripe, Deepgram) has a fallback. Missing keys don't crash the app
- **Conditional call forwarding:** Users keep their existing number; OneClerk only answers calls they miss (`*71` forwarding codes)
- **Multi-language support:** 17 language enum values; voice ID mapped per language in settings; language auto-detected at runtime from Unicode character ranges
- **Redis caching:** FAQ responses cached by MD5 hash of query text to reduce OpenAI calls
- **Audio TTL:** Synthesized MP3 files deleted after 5 minutes to prevent disk fill

---

## External Dependencies

### Telephony
- **Telnyx** — primary telephony (call control API, voice webhooks, SMS/WhatsApp messaging). Configured via `TELNYX_API_KEY`, `TELNYX_CONNECTION_ID`, `TELNYX_PHONE_NUMBER`, `TELNYX_MESSAGING_PROFILE_ID`
- **Twilio** — legacy/parallel integration for TwiML voice loop (`<Gather>`, `<Say>` with Polly). Older route files reference Twilio directly

### AI / Voice
- **OpenAI** (`gpt-4o-mini` default) — conversation brain, urgency detection, booking intent. Key: `OPENAI_API_KEY`
- **ElevenLabs** — neural TTS, `eleven_turbo_v2_5` model. Key: `ELEVENLABS_API_KEY`. Falls back to Twilio Polly
- **Deepgram** (Nova-2) — speech-to-text transcription. Key: `DEEPGRAM_API_KEY`

### Payments
- **Stripe** — subscription billing. Keys: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_STARTER_PRICE_ID`, `STRIPE_GROWTH_PRICE_ID`, `STRIPE_SCALE_PRICE_ID`

### Google
- **Google Calendar API** — appointment creation. Keys: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- **Gmail API** — confirmation emails (via same Google OAuth tokens)

### Infrastructure
- **PostgreSQL** — primary database via `DATABASE_URL` (Replit provides this automatically)
- **Redis** — Celery broker + backend + response cache via `REDIS_URL`
- **Railway** — deployment target (`railway.json` at root of `oneclerk/`)

### Auth
- **JWT** — `python-jose` for token creation/validation
- **bcrypt** — via `passlib` for password hashing