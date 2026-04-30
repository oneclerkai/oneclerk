# OneClerk — Voice AI Receptionist

> Your phone rings. OneClerk handles it.

OneClerk is a voice AI receptionist for clinics, hotels, restaurants, salons, and offices. The user sets call forwarding on their existing business phone to a OneClerk number; the AI answers, handles the conversation, and sends the owner a WhatsApp summary afterwards.

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
  main.py                # FastAPI app, lifespan, router wiring, /, /health, /app, /static
  config.py              # Settings via pydantic-settings (env vars)
  database.py            # Async SQLAlchemy engine + Base + init_models() + get_db()
  routes/
    auth.py              # /auth/signup, /auth/login, /auth/me
    agents.py            # /agents/create|list|{id}|{id}/activate|{id}/deactivate|{id}/calls, DELETE /agents/{id}
    calls.py             # Twilio webhooks: /calls/incoming, /calls/respond/{id}, /calls/status, /calls/recent, GET /calls/{id}
    dashboard.py         # /dashboard/stats
    webhooks.py          # /webhooks/stripe, /webhooks/whatsapp
  services/
    ai_brain.py          # OpenAI conversation, urgency + booking-intent detection
    whatsapp.py          # Owner summaries + caller confirmations via Twilio WhatsApp
    voice_engine.py      # Stub for ElevenLabs TTS (uses Twilio Polly by default)
  models/
    user.py, agent.py, call.py, contact.py, conversation.py
  static/
    index.html           # Single-page dashboard (Tailwind via CDN, vanilla JS) — served at /app
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
4. In OneClerk, create an agent and set its `twilio_number` to the Twilio number you bought.
5. Tell your customer's phone to call-forward unanswered calls to that Twilio number.

## Endpoints (cheat sheet)
- `GET /` / `GET /health` — service info + which integrations are configured
- `GET /docs` — Swagger UI
- `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`
- `POST /agents/create`, `GET /agents/list`, `PUT /agents/{id}`, `POST /agents/{id}/activate`, `POST /agents/{id}/deactivate`, `DELETE /agents/{id}`, `GET /agents/{id}/calls`, `GET /agents/{id}/setup-instructions?carrier=…`
- `POST /calls/incoming` (Twilio TwiML), `POST /calls/respond/{call_id}` (Twilio TwiML), `POST /calls/status`, `GET /calls/recent`, `GET /calls/{id}`, `GET /calls/audio/{filename}` (ElevenLabs MP3 cache)
- `GET /dashboard/stats`
- `GET /billing/plans`, `GET /billing/status`, `POST /billing/create-checkout`, `POST /billing/create-portal`
- `POST /webhooks/stripe` (signature-verified), `POST /webhooks/whatsapp` (real inbound replies)
- `GET /app` — bundled multi-page dashboard SPA (auth, dashboard, calls, agents wizard, settings, billing)

## Frontend
- `app/static/index.html` — shell that loads `styles.css` + `app.js` + Lucide + Inter.
- `app/static/app.js` — vanilla-JS hash router with pages: split login/signup, dashboard (stat cards + recent calls + agents panel), calls (search/filter + slide-in detail panel), agents grid, agent create/edit form, **drag-and-drop flow builder** (`/agents/:id/flow`), multi-step **Connect** wizard with built-in **test-chat** widget (`/agents/:id/setup`), settings, billing (Stripe checkout + customer portal). Each agent screen shares a Profile / Flow / Connect sub-tab navigation.
- **Flow builder**: nodes are typed (greeting, ask, info, branch, book, whatsapp, escalate, end), saved to `agent.config.flow = {nodes, edges}`. The AI brain (`app/services/ai_brain.py::_flow_to_script`) converts the graph into a numbered script appended to the system prompt, so flow edits affect live calls without code changes.
- Theme: deep navy `#0A0F1E` with indigo `#6366F1` accent for the dashboard.
- **Landing page** (`route("auth")` in `app.js`): single-font (Poppins everywhere, including dashboard) white paper hero with **animated square grid moving upward** (`@keyframes lpGridUp`), white **triangular perspective light cone** from top→bottom (`.lp-light-cone` borders + `.lp-light-bright` clip-path triangle), glassmorphic pill nav, "World's first autonomous Voice agent" headline with pencil-textured `<span class="lp-brick">Voice</span>` (Poppins 900 via SVG turbulence filter `#lp-pencil`), rotating subtitle, four hyper-realistic **yellow lined-paper sticky notes** (`.lp-note` with horizontal rules via repeating-linear-gradient + side border lines + tape strip via `::before`) showing title + body problem/feature copy. Followed by a black use-case section with a **forward-facing infinite-loop image slider** (`.lp-slider` + `@keyframes lpSlide`, no arrows, 7 SVG product mockups duplicated for seamless wrap, captions in box below each frame). Then white **reviews section with downward-moving dots** (`.lp-reviews::before` + `@keyframes lpDotsDown`) and two infinite review tracks of single-color realistic sticky-note testimonials (`.lp-review`) each with avatar img (`i.pravatar.cc`) + name + workplace + problem-solving copy. Finally a black footer with footer link columns and giant `ONECLERK` letters that arc upward (parabola) and **settle perfectly straight horizontal** at end of scroll (`initParabolaWord` ease-out cubic with rotation/lift driven by `(1 - ease(t))`). Auth modal styled white + Poppins.

## Deployment
Configured for Replit autoscale running the same uvicorn command. Push the Publish button when ready.

## Notes / next steps
- The brief uses **Supabase**; this build uses **SQLAlchemy + Replit Postgres** so it runs without external accounts. The table shapes match (`users`, `agents`, `calls`, `contacts`) so a Supabase swap later is mechanical.
- Days 11–14 (dashboard) are delivered as a single-page web app at `/app` instead of a separate Next.js project — same dark theme, fully wired to the API. A Next.js port can be added later if desired.

## v12 redesign (2026-04-27)
- **Landing**: Poppins title resized & centered (`clamp(34px, 4.4vw, 64px)`), faster mesh animation (5s) with side-only fade, four 3D comic sticky notes (`.lp-note-3d`) in a horizontal sequence connected by SVG arrows of varied art-styles (loop/zigzag/doublecurl/hook), glassmorphic 3D integrations plate (`.lp-glass-plate`) with Phone/WhatsApp/IG/GCal/Gmail, auto slideshow (no hover pause), anime sticky review cards (click-to-pause tip), gradient strips between sections, gradient (no image) Q&A panel, footer triangular white glow + section shadows, working in-page nav scroll.
- **Voice tester** section: language + voice + agent type pickers with animated waveform driven by Web Speech API (`.lp-try`).
- **Calls page**: 2-column layout (`cl-layout-2`) with agent history showing phone+company+name, recent callers list, big calendar (`.cl-bigcal`) with month nav, booking blocks, click-to-popup day editor with custom user notes (color-tagged) saved to localStorage (`CL_NOTES_KEY`). Call popup includes auto-generated 5-line summary and full transcript.
- **Agent builder**: "Create your first agent" auto-creates a default agent and drops into Make.com-style canvas with glassmorphic 3D OneClerk orb (`.agb-orb`) + `+` button popup menu of integrations (whatsapp/phone/calendar/gmail/data uploads).
- **Onboarding**: replaced background image with pure CSS multi-radial gradient (`.ob-bg`); removed `app/static/img/onboarding_bg.png`.
- Cache-bust bumped to `v=12` in `index.html`.

## v14 landing/UX overhaul (2026-04-27)
- **Hero**: single-line catchy title `Your phone never sleeps. Neither does OneClerk.` (`.lp-title-one`), italic-orange tail. Hero padding reduced; integrations plate hidden so the comic notes hug the title.
- **Brand floats**: replaced lucide chips with REAL inline brand SVGs (`BRAND_SVG.whatsapp/gmail/gcal/ig/phone`) shown as transparent shadowed cards (`.lp-float-brand`). Phone float uses 3 ringing-curve paths (`.ph-rings` + `phRing` keyframes).
- **Voice tester**: now actually switches language AND tone. `TRY_LANG_MAP` maps each picker option to a BCP-47 code + greeting; `TRY_VOICE_MAP` maps tone to `{rate, pitch, gender, prefer}`. `pickBestVoice()` picks the closest available `speechSynthesis` voice (lang + gender + name preference) with `onvoiceschanged` caching. Selecting any picker fires a live preview; `currentPitch` drives the waveform animation speed.
- **Auth modal**: textured animated background — grain layer (`.auth-bg-grain`) + 3 colored blobs (`.auth-bg-blob-a/b/c`) with independent ease-in-out keyframes; modal entrance pop (`.auth-modal-pop`).
- **Agent builder**: brand-logo box headers (`.agb-box-icon-brand`), drag-from-anywhere (mousedown anywhere on `.agb-box`, ignoring inputs/buttons/handles; toggles `is-dragging` cursor), ringing-phone bars on the phone box (`.agb-phone-rings` + `agbRing` keyframes), helper hints (`.agb-hint`), green linked-state for calendar status.
- **Page transitions**: `.page` and `.landing` get a 220ms `pageEnter` translateY+fade.
- Cache-bust bumped to `v=14` in `index.html`.

## v15 landing/builder/billing refresh (2026-04-27)
- **Hero title**: bigger, bolder two-sentence catch — "World's *No.1* AI Voice Agent Builder. Build Your Agent And *Replace Your Clerk.*" with a gradient-orange italic accent on the highlighted phrases. Hero spacing widened so the page breathes.
- **Brand floats**: bumped to 120×120px, repositioned firmly inside the corners (32px insets) so they're never clipped, glassy white background + soft drop shadow, larger 88px logos.
- **Pricing**: Starter $39, Growth $99, Scale $149 (now headlined "1,000 calls per month"). Trial copy reduced to **7-day** free trial across landing + dashboard. Backend `PLANS` dict + `_trial_end()` updated to match.
- **Agent builder (drag-and-drop)**:
  - Added a Gmail card to the integration menu (real Gmail logo).
  - Every box header + orb-menu item now uses real brand SVGs (WhatsApp, Phone, Google Calendar, Gmail, OneClerk OC orb, sticky-note for Talking points, cloud for Upload).
  - Inputs got proper uppercase labels (`.agb-flabel`), a custom-styled `<select>` for the agent voice, and consistent linked/unlinked status lines (`✓ Receiving calls`, `✓ Linked — bookings drop in`, etc.).
  - Boxes are larger (240×170), with a softer card style, hover-lift, and a strong scale + amber ring while dragging — clearly draggable from anywhere.
- Cache-bust bumped to `v=15` in `index.html`.

## v16 — title fit, brand float reflow, tutorial, auth memory (2026-04-27)
- **Hero title**: now exactly two horizontal lines via per-sentence `<span class="lp-title-line">` with `white-space: nowrap` and a smaller, fluid font (`clamp(20px, 3.4vw, 50px)`) so each sentence stays on its own line at all common widths.
- **Brand floats**: pulled all 4 down to the comic-notes row — WhatsApp/Gmail on the left at top:470/660, Google Cal/Phone on the right at 470/660. Added `≤1280px` shrink rule (96×96 chips) and `≤900px` hide so they never overlap mobile content.
- **Builder + button**: now uses `closest("#agb-orb-plus")` in the document-level outside-click handler so clicking the inner SVG no longer re-opens the menu after closing. Plus also gets `is-open` state (rotates 45°, turns amber).
- **First-ever builder tutorial**: 5-step coach-mark overlay (welcome orb, click +, drag from anywhere, connect handles, save). Highlights the target with a glowing amber spot, animated pointer arrow, white card with `Step n of 5`, Back / Next, plus a `Skip tour` button shown **only on the first ever build** (gated by `localStorage["oc_seen_builder_tutorial"]`). Esc closes; resize/scroll repositions; auto-opens the orb menu when arriving at the "Add an integration" step.
- **Auth remembering**: `ACCESS_TOKEN_EXPIRE_MINUTES` bumped to 30 days (was 60 min) so users stay signed in across sessions.
- Cache-bust bumped to `v=16` in `index.html`.

## v17 — preview tabs, builder polish, full mobile pass (2026-04-30)
- **Dashboard preview** (`mountDashboardPreview`): the WhatsApp-only side window is now a 3-tab live mini-app (`.ap-tabs`, `.ap-pane-wrap`):
  - **WhatsApp** — owner summary bubble (existing `mountWhatsAppWindow`).
  - **Gmail** — `mountGmailWindow` types out a confirmation email (subject + body line-by-line) and animates the **Send** button into a green "✓ Sent · just now" status, then loops.
  - **Calendar** — `mountCalendarWindow` shows a 7-day Google-Calendar-style strip and drops 5 colored bookings in one by one (`apCalEvtIn` pop), with a live "📅 New booking · …" status pulse.
  - Tabs auto-rotate every 8s until the user clicks one. Same tabbed component is now used on the full agent preview page, with all three windows mounted and a click-to-switch wiring (no auto-rotate so it doesn't fight the user).
- **Drag-and-drop polish** (agent builder canvas):
  - Grip indicator (`.agb-box-grip` ⋮⋮) rendered in every box header so users instantly see it's draggable; header `title="Drag to move"`.
  - **Alignment guides** (`.agb-guide-v` / `.agb-guide-h`) appear during drag whenever the moving box's L/Cx/R or T/Cy/B edges come within `ALIGN_SNAP=8px` of another box's edge — and the box snaps onto that line. Guides clear on drop.
  - Connection handles are bigger (18×18 with a `.agb-handle-dot` core), the outgoing handle has a continuous `agbHandlePulse` ring so the affordance is discoverable.
  - Plus-orb pulses softly (`agbOrbHint`) when its menu is closed so first-time users notice it. Click-toggles open/close (already in place).
- **Mobile responsiveness pass** (`styles.css` v17 block, ~250 new lines):
  - **≤900px (tablet)**: nav + hero shrink, comic notes go 2×2 (arrows hidden), glass plate compact, pricing 2-col, try-it-live controls 2-col.
  - **≤600px (phone)**: sidebar collapses to icon-only 60px; landing nav hides center links; hero title clamps to 22–30px with stacked CTA buttons; comic notes stack to single column with no rotation; floating brand cards hidden; preview tabs hide labels (icon-only); calendar days shrink; agent-builder orb shrinks to 60px and orb menu becomes width-capped to viewport.
  - **≤380px**: title 20px, calendar tile 80px high.
  - All rules use `!important` only where needed to override inline absolute positions, and never reposition elements — they only shrink components and text per the request.
- Cache-bust bumped to `v=20` in `index.html`.

## v18 — preview always-on (sample mode), real preview data, agents page header card (2026-04-30)
- **Backend** (`app/api/dashboard.py`):
  - Added `/dashboard/preview` returning `{has_agent, agent_id, agent_is_active, business_name, agent_name, voice, latest_caller, upcoming_bookings, week_counts}`. Pulls real caller name/summary from the most-recent `Call`, maps booked calls into the next-7-days strip, and counts per-day bookings — used by the live tabbed preview to drop **real** customer names into the WhatsApp/Gmail/Calendar windows when an agent is active.
  - `/dashboard/stats` extended with `total_minutes` (from `duration_seconds`) and `total_agents` so the dashboard stat cards no longer show 0 for those tiles.
- **Backend** (`app/api/agents.py`):
  - Added `/agents/{id}/summary` returning `{calls_total, calls_today, bookings, urgent, minutes_total, last_call_at, last_caller, nodes, edges, twilio_number}`. Powers the new per-agent header card on the agents page. Reads layout node/edge counts from `business_context.builder_layout`.
- **Frontend** (`app/static/app.js`):
  - `mountDashboardPreview` rewritten to ALWAYS render the live tabbed preview. When the user has no agent yet, it now renders in **SAMPLE mode** with a `SAMPLE_PREVIEW_AGENT` (Bright Smile Dental / Maya), an orange `SAMPLE PREVIEW` banner across the top with a `Create your agent →` CTA, and a header that reads "Live Preview · how your agent will work". When a real agent exists, the dashboard fetches `/dashboard/preview` and feeds `latest_caller` + `upcoming_bookings` + business/agent name into `mountWhatsAppWindow`, `mountGmailWindow`, `mountCalendarWindow` (all three signatures gained an optional `previewData` arg).
  - `mountGmailWindow` now derives `callerEmail` from the real caller's name (`firstname.lastname@gmail.com`) when present.
  - `mountCalendarWindow` uses real `upcoming_bookings` when available (otherwise the existing 5 sample slots) and the footer reads "Showing your real bookings · live updates" / "Real booking · Name · Time" so the user can tell at a glance.
  - **Agents page** (`route("agents")`):
    - New per-agent **header summary card** (`.agb-summary`) above the builder canvas: agent avatar + name, `Live`/`Paused` badge with a pulsing dot, business · language · twilio number sub-line, and 5 stat tiles (Calls today / All-time / Bookings / Escalated / Last call with caller name & relative time). Stats fetched async from `/agents/{id}/summary` per active tab; "Last call" uses a small `relativeTime()` helper (`Just now`, `12 min ago`, `3h ago`, `5d ago`, or absolute date).
    - Toolbar slimmed (removed the duplicate live/paused badge now shown in the summary card) — left side just shows a quiet "Flow builder" hint icon, right side keeps Pause/Activate, Delete, Save.
    - **Empty state** rebuilt as a richer card (`.agb-empty-rich`): glowing OneClerk orb avatar with pulsing radial glow, headline, subcopy, and a 3-step numbered bullet list (Tell us → Plug in tools → Forward number) before the CTA — much clearer first-time onboarding signal than the previous icon + paragraph.
- **CSS** (`app/static/styles.css`): added `.ap-sample-banner` (orange gradient + uppercase pill + responsive collapse on ≤600px), `.agb-summary` + `.agb-summary-stats` + `.agb-stat` (responsive: 4-col grid → 4-col on tablet with last-call below → 2-col on phone), `.agb-empty-rich` block (orb + pulsing glow + numbered bullets), and `.agb-toolbar-slim` quiet styling.
- **NOTE**: discovered a parallel router tree at `app/routes/` that is **not** wired into `main.py` (which loads from `app/api/`). All real backend changes for v18 went into `app/api/`. The `app/routes/` files exist but are dead code — leaving them untouched to avoid scope creep.
- Cache-bust bumped to `v=21` in `index.html` (both `app.js` and `styles.css`).
