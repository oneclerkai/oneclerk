# Voice AI Agent Platform

## Overview
FastAPI backend for a voice AI agent platform. Designed to integrate with Twilio (telephony), OpenAI (LLM), Deepgram (speech-to-text), ElevenLabs (text-to-speech), Stripe (billing), and PostgreSQL/Redis for storage and queues.

The repository was imported as a near-empty scaffold; minimal working stubs were filled in so the app runs in Replit. External-service features (auth, agents, calls, webhooks) return placeholder responses until the corresponding API keys and database are configured.

## Stack
- Python 3.12
- FastAPI + Uvicorn (ASGI)
- SQLAlchemy 2.x async + asyncpg (PostgreSQL)
- Pydantic v2 + pydantic-settings
- python-jose (JWT), passlib (bcrypt)

## Project Layout
```
app/
  main.py            # FastAPI app + router wiring + /health, /
  config.py          # Settings via pydantic-settings (env vars)
  database.py        # Async SQLAlchemy engine + Base + get_db()
  dependencies.py    # JWT auth dependency
  api/
    auth.py          # /api/auth/{register,login}
    agents.py        # /api/agents
    calls.py         # /api/calls
    dashboard.py     # /api/dashboard/stats
    webhooks.py      # /api/webhooks/{twilio,stripe}
  models/
    user.py, agent.py, call.py, conversation.py
```

## Running on Replit
Workflow `Start application` runs:
```
uvicorn app.main:app --host 0.0.0.0 --port 5000
```
Port 5000 (webview) is the only externally-exposed port in the Replit preview.

## Environment Variables
See `.env.example`. None are strictly required to start the server, but features that depend on them will be disabled (database, OpenAI, Twilio, etc.). `DATABASE_URL` may be provided by Replit's built-in Postgres.

## Endpoints
- `GET /` — service info
- `GET /health` — liveness + which services are configured
- `GET /docs` — Swagger UI
- `POST /api/auth/register`, `POST /api/auth/login` — auth (require DB)
- `GET /api/agents/`, `GET /api/calls/`, `GET /api/dashboard/stats` — JWT-protected stubs
- `POST /api/webhooks/twilio`, `POST /api/webhooks/stripe` — webhooks

## Deployment
Configured for Replit autoscale deployment running the same uvicorn command on `$PORT`.
