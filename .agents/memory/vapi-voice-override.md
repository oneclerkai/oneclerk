---
name: Vapi voice override
description: Why we use OpenAI TTS (not Cartesia) and how the shared override helper works
---

## Rule
Always use `provider: "openai"` for **all** Vapi voice overrides, for **every language**.
Never use `provider: "cartesia"`, `provider: "11labs"`, or `provider: "deepgram"` in voice blocks.

**Why:** The Vapi account does not have Cartesia or ElevenLabs API keys configured. Passing those providers causes Vapi to silently fall back to a low-quality internal TTS or hard-fail with a voiceId error. OpenAI TTS (nova/echo/shimmer/onyx/fable) speaks any language naturally from text content — no language-specific voiceId needed per language.

## Voice map (OPENAI_VOICE_MAP in app.js)
- maya   → nova    (warm female)
- arjun  → echo    (calm male)
- sofia  → shimmer (bright female)
- daniel → onyx    (professional male)
- linh   → shimmer (soft female)
- emma   → nova    (empathetic female)
- chris  → fable   (energetic male)

## Model override
Always use `provider: "openai", model: "gpt-4o-mini"` — do NOT switch to Google Gemini.
Google provider credentials are not reliably configured on the Vapi account.

## Shared helper (app/static/app.js)
`buildVapiOverrides(voice, lang, agentType?, agentConfig?)` — takes a PREVIEW_VOICES entry + PREVIEW_LANGS label string.
- voice block: `{ provider: "openai", voiceId: OPENAI_VOICE_MAP[voice.id] || "nova" }` — same for all languages
- model block: `{ provider: "openai", model: "gpt-4o-mini", temperature: 0, messages: [system] }`
- transcriber: deepgram nova-2 for natively-supported langs; nova-2-general + "multi" for Indian/others
- firstMessage: per-language greeting from `HARKLY_FIRST_MSG[langCode]`
- system prompt starts with `[LANGUAGE RULE] You MUST speak ONLY in <language>` — CRITICAL for non-English

`buildVapiOverridesFromBcp47(voice, bcp47)` — variant for agent-setup page that has a BCP-47 code directly.

**How to apply:** Any new Vapi call site must call `buildVapiOverrides(...)` — never build the override manually.
