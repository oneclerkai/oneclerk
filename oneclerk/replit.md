# OneClerk — Voice AI Receptionist (Replit)

## Architecture

**Two services run in parallel:**

| Service | Port | Workflow |
|---|---|---|
| Next.js Frontend (production: standalone) | 5000 (preview) | `Start application` |
| FastAPI Backend | 8000 | `Backend API` |

Next.js proxies all `/api/*` requests to the FastAPI backend at `http://localhost:8000`.

## Development
- Frontend (Next.js): `cd oneclerk/frontend && npm run dev -- -p 5000`
- Backend (FastAPI): `cd oneclerk && uv run python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`

## Production Build
- Build: `cd oneclerk/frontend && npm install --legacy-peer-deps && npm run build && cp -r .next/static .next/standalone/.next/static`
- Run: `HOSTNAME=0.0.0.0 PORT=5000 node .next/standalone/server.js`

## Key Decisions (Replit migration)
- `output: 'standalone'` in `next.config.js` for containerized deployment
- `export const dynamic = 'force-dynamic'` in root layout to prevent SSR pre-rendering issues
- `src/pages/_document.tsx` + `src/pages/_error.tsx` required by Next.js 15 for pages router compatibility (prevents `<Html>` validation error during 404 generation)
- Root `/` redirect to `/app` is done in **middleware.ts** (not `page.tsx`) so it runs before React renders — avoids the "Invalid hook call" error that `redirect()` inside a component tree caused
- Zustand v4 (stable, SSR-safe with Next.js 15)
- `react-hot-toast` loaded with `ssr: false` to avoid SSR context issues
- `ClientOnly` wrapper prevents hook execution before React hydration
- PostgreSQL: Replit built-in DB (DATABASE_URL secret auto-set)

## External Deployment Config
| File | Purpose |
|---|---|
| `oneclerk/nixpacks.toml` | Railway/Nixpacks build — uses `python312Packages.pip` (Nix pip binary fix) |
| `oneclerk/railway.json` | Railway deploy config — start command + healthcheck |
| `oneclerk/Procfile` | Heroku-style start command fallback |
| `oneclerk/frontend/vercel.json` | Vercel build — includes `--legacy-peer-deps` for install |

## Stack Versions
| Package | Version |
|---|---|
| Next.js | 15.5.15 (pinned via ^15.3.1) |
| React | 18.3.1 |
| ESLint | 9.39.4 (pinned via ^9.25.1) |
| zustand | 4.5.7 |
| Python | 3.12 |
| FastAPI | latest |

## Environment / Secrets
Non-sensitive config is in `.replit` `[userenv.shared]`. Secrets must be added via the Secrets panel:

| Secret | Purpose |
|---|---|
| `DATABASE_URL` | Auto-set by Replit PostgreSQL |
| `OPENAI_API_KEY` | AI conversation brain |
| `TELNYX_API_KEY` + related | Voice calls |
| `DEEPGRAM_API_KEY` | Speech-to-text |
| `ELEVENLABS_API_KEY` | Text-to-speech |
| `STRIPE_SECRET_KEY` + related | Billing |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `ENCRYPTION_KEY` | Data encryption |
| `JWT_SECRET_KEY` | Auth tokens (set in userenv.shared) |

## Project Layout
```
oneclerk/
  app/                     # FastAPI backend
    main.py                # App entry, routers, CORS, static
    config.py              # Pydantic settings
    database.py            # Async SQLAlchemy + asyncpg
    api/                   # API routers
      auth.py, agents.py, calls.py, dashboard.py
      billing.py, integrations.py, webhooks.py, preview.py
    models/                # SQLAlchemy ORM models
    schemas/               # Pydantic schemas
    services/              # OpenAI, Telnyx, Deepgram, ElevenLabs, Stripe
    static/                # Legacy static SPA (served at /app)
  frontend/                # Next.js 15 frontend
    src/app/               # App Router pages
      (auth)/login, (auth)/signup
      auth/callback
      dashboard/, onboarding/
    src/pages/             # Pages Router compat files (_document, _error)
    src/hooks/             # useAuth, useAgents, useDashboard, useIntegrations
    src/lib/               # api.ts (axios), store.ts (zustand v4)
    next.config.js         # standalone output + API proxy to :8000
  requirements.txt         # Python dependencies
```
