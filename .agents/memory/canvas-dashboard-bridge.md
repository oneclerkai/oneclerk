---
name: Canvas→dashboard bridge
description: How canvas flow builder card changes are persisted so the dashboard preview shows the right voice/language
---

## Mechanism
When a user changes a Voice or Language card in the agent flow builder canvas, the `upd()` handler (attached to `[data-field]` inputs) writes to localStorage:
- `oc_last_voice` → voice id string (e.g. "arjun")
- `oc_last_lang` → full PREVIEW_LANGS label (e.g. "Hindi (हिंदी)")

The dashboard preview `initDashPreview()` reads these keys on init to pre-select the voice pill and language chip, so navigating dashboard → canvas → dashboard keeps the selection intact.

## Also: dashboard click persistence
Clicking a voice pill or language chip on the dashboard also writes to the same localStorage keys, so selections survive page navigation.

**How to apply:** Any new voice/language selection UI that should influence the dashboard preview should write to `oc_last_voice` and `oc_last_lang`.
