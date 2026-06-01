---
name: Vapi voice override
description: Why we use OpenAI TTS (not Cartesia) and how the shared override helper works
---

## Rule
Always use `provider: "openai"` when overriding Vapi voice. Never use `provider: "cartesia"` or `provider: "11labs"` in overrides.

**Why:** The Vapi account does not have Cartesia or ElevenLabs API keys configured. Passing those providers causes Vapi to silently fall back to a low-quality internal TTS, producing crackling/robotic audio. OpenAI TTS is always available (uses the same OpenAI key the Vapi account needs anyway) and is high quality. It also speaks whatever language the AI responds in, making multilingual work without any separate voice per language.

## Voice map (OPENAI_VOICE_MAP)
- maya → nova (warm female)
- arjun → echo (calm male)
- sofia → shimmer (bright female)
- daniel → onyx (deep male)
- linh → shimmer (soft female)
- emma → nova (empathetic female)
- chris → fable (energetic male)

## Shared helper (app/static/app.js)
`buildVapiOverrides(voice, lang)` — takes a PREVIEW_VOICES entry and a PREVIEW_LANGS label string.
- Always sets `voice: { provider: "openai", voiceId: ... }`
- For non-English: sets `transcriber: { provider: "deepgram", language: langCode }` AND injects a system message telling the AI to respond in that language.

`buildVapiOverridesFromBcp47(voice, bcp47)` — variant for the agent-setup page which has a BCP-47 code directly.

**How to apply:** Any new Vapi call site should call `buildVapiOverrides(...)` instead of building the override object manually.
