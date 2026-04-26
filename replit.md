# Rinq — Voice AI Receptionist

> Your phone rings. Rinq handles it.

Rinq is a voice AI receptionist for clinics, hotels, restaurants, salons, and offices. The user sets call forwarding on their existing business phone to a Rinq number; the AI answers, handles the conversation, and sends the owner a WhatsApp summary afterwards.

## Stack
- **Python 3.12** + **FastAPI** + **Uvicorn**
- **SQLAlchemy 2.x async** + **asyncpg** (PostgreSQL — Replit's built-in DB is auto-detected via `DATABASE_URL`)
- **Pydantic v2** + **pydantic-settings**
- **Twilio Programmable Voice** (TwiML `<Gather>` for STT, `<Say>` with Polly for TTS) and **Twilio WhatsApp** for owner summaries
- **OpenAI** (`gpt-4o-mini` by default) for the conversation brain
- **JWT** auth + **bcrypt** password hashing

## Project Layout
```
app/
  main.py                # FastAPI app, lifespan, router wiring, /, /health
  config.py              # Settings via pydantic-settings (env vars)
  database.py            # Async SQLAlchemy engine + Base + init_models() + get_db()
  routes/
    auth.py              # /auth/signup, /auth/login, /auth/me
    agents.py            # /agents/create|list|{id}|{id}/activate|{id}/deactivate|{id}/calls
    calls.py             # Twilio webhooks: /calls/incoming, /calls/respond/{id}, /calls/status, /calls/recent
    dashboard.py         # /dashboard/stats
    webhooks.py          # /webhooks/stripe, /webhooks/whatsapp
  services/
    ai_brain.py          # OpenAI conversation, urgency + booking-intent detection
    whatsapp.py          # Owner summaries + caller confirmations via Twilio WhatsApp
    voice_engine.py      # Stub for ElevenLabs TTS (uses Twilio Polly by default)
  models/
    user.py, agent.py, call.py, contact.py, conversation.py
```

## Running on Replit
A single workflow `Start application` runs:
```
uvicorn app.main:app --host 0.0.0.0 --port 5000
```
Port 5000 (webview) is the only externally-exposed port in the Replit preview. Tables are auto-created at startup if `DATABASE_URL` is set.

## Environment Variables (all optional to start)
See `.env.example`. The app starts cleanly with none configured; features degrade gracefully:

| Var | Without it… |
|---|---|
| `DATABASE_URL` | DB-backed routes return 500. Replit's built-in Postgres provides this automatically. |
| `OPENAI_API_KEY` | The AI brain returns a polite "the owner will get back to you" fallback. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` / `TWILIO_WHATSAPP_NUMBER` | WhatsApp summaries are logged but not sent. Inbound TwiML still works. |
| `JWT_SECRET_KEY` | Auth still works but tokens use the insecure default — **set this for production**. |
| `STRIPE_*`, `ELEVENLABS_API_KEY`, `DEEPGRAM_API_KEY`, `WHATSAPP_TOKEN` | Reserved for future features. |

## Connecting Twilio
1. Buy a Twilio number.
2. Set its **Voice → A Call Comes In** webhook to `https://<your-app>.replit.app/calls/incoming` (POST).
3. Optionally set the **Status Callback** to `/calls/status` (POST).
4. In Rinq, create an agent and set its `twilio_number` to the Twilio number you bought.
5. Tell your customer's phone to call-forward unanswered calls to that Twilio number.

## Endpoints (cheat sheet)
- `GET /` / `GET /health` — service info + which integrations are configured
- `GET /docs` — Swagger UI
- `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`
- `POST /agents/create`, `GET /agents/list`, `PUT /agents/{id}`, `POST /agents/{id}/activate`, `POST /agents/{id}/deactivate`, `GET /agents/{id}/calls`
- `POST /calls/incoming` (Twilio TwiML), `POST /calls/respond/{call_id}` (Twilio TwiML), `POST /calls/status`, `GET /calls/recent`
- `GET /dashboard/stats`
- `POST /webhooks/stripe`, `POST /webhooks/whatsapp`

## Deployment
Configured for Replit autoscale running the same uvicorn command. Push the Publish button when ready.

## Notes / next steps
- The brief uses **Supabase**; this build uses **SQLAlchemy + Replit Postgres** so it runs without external accounts. The table shapes match (`users`, `agents`, `calls`, `contacts`) so a Supabase swap later is mechanical.
- The Next.js dashboard from Days 11–14 is not yet built — the API is fully ready for it.
