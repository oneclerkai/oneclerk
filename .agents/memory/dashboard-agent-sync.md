---
name: Dashboard agent sync
description: How the agents mini-panel and voice preview are wired together on the dashboard
---

## Pattern
`initDashPreview()` is a named IIFE that returns a controller object stored in `let _dpc`. The agents mini-panel (populated after the async API load) calls `_dpc.syncAgent(agent)` to push the agent's voice/language into the preview.

**Why:** The preview initialises synchronously (before agents load), so it can't read agent data at init time. Storing the controller in `_dpc` bridges the timing gap.

## syncAgent(agent) does:
1. Finds the matching PREVIEW_VOICES entry from `agent.config.voice_id`
2. Finds the matching PREVIEW_LANGS entry from `agent.config.language`
3. Highlights the correct voice pill and language chip
4. Updates `#dash-prev-agent-name` and `#dash-prev-agent-meta` text

## Auto-select behaviour
After rendering agent rows, the code auto-selects the first active agent and calls `_dpc.syncAgent()` on it. Clicking a row also calls `syncAgent`.

## Agent mini-panel features
- `.dmi-row` — selectable rows with left-border highlight on selection
- `.dmi-toggle` — ⚡ Go Live / Pause buttons that call activate/deactivate API inline
- `showQuickActivate()` — inline phone-number sheet shown when agent has no phone; saves number then activates
- `openQuickCreate()` — 3-step modal (Details → Voice → Phone) accessible from "New" button on dashboard
