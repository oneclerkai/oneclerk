"""Voice agent pipeline — orchestrates Deepgram → OpenAI → ElevenLabs.

This module wires together the three AI services for a complete voice
conversation turn:

  1. Transcription  — Deepgram converts caller speech to text
  2. Intelligence   — OpenAI GPT generates a contextual response
  3. Synthesis      — ElevenLabs converts the response to 8 kHz µ-law audio

The pipeline is designed for < 800 ms end-to-end latency by:
  - Streaming ElevenLabs audio sentence-by-sentence
  - Caching common AI responses in Redis
  - Reusing the Deepgram and ElevenLabs SDK clients across calls

Barge-in support:
  The caller can interrupt the agent at any time. The webhook layer
  (handle_gather_ended) stops playback via telnyx.Call.playback_stop()
  before calling process_voice_turn(), so barge-in is handled at the
  Telnyx layer rather than here.
"""
from __future__ import annotations

import logging
from typing import AsyncGenerator

from app.services import ai_brain, synthesis
from app.services.transcription import resolve_transcript

logger = logging.getLogger("oneclerk.voice_agent")


async def process_voice_turn(
    transcription: str,
    agent,
    conversation_history: list[dict],
    call_context: dict | None = None,
) -> dict:
    """Run one full voice conversation turn.

    Args:
        transcription: The caller's spoken text (already transcribed).
        agent: The Agent ORM object with config, voice_id, language, etc.
        conversation_history: List of {"role": ..., "content": ...} dicts
            representing the conversation so far.
        call_context: Optional dict with extra context (channel, caller_number, etc.)

    Returns:
        {
            "audio_url": str,          # Public URL to the synthesized audio file
            "response_text": str,      # The AI's text response
            "escalate": bool,          # True if the call should be escalated
            "booking_detected": bool,  # True if a booking was detected
            "booking_service": str|None,
            "booking_step": str|None,
        }
    """
    ctx = call_context or {}

    # ── Step 1: Get AI response from OpenAI ──────────────────────────────────
    ai_result = await ai_brain.get_ai_response(
        user_message=transcription,
        conversation_history=conversation_history,
        agent=agent,
        call_context=ctx,
    )

    response_text: str = ai_result.get("response") or "I'll have someone call you right back."
    escalate: bool = bool(ai_result.get("escalate", False))
    booking_detected: bool = bool(ai_result.get("booking_detected", False))
    booking_service: str | None = ai_result.get("booking_service")
    booking_step: str | None = ai_result.get("booking_step")

    logger.info(
        "voice_turn agent=%s escalate=%s booking=%s text=%r",
        getattr(agent, "id", "?"),
        escalate,
        booking_detected,
        response_text[:60],
    )

    # ── Step 2: Synthesize response with ElevenLabs ───────────────────────────
    # Use the full synthesize() call for a single audio URL (used by Telnyx
    # playback_start). For streaming, use stream_voice_turn() below.
    audio_url: str = await synthesis.synthesize(
        text=response_text,
        language=getattr(agent, "language", "english") or "english",
        gender="female",
        voice_id=getattr(agent, "voice_id", None) or None,
    )

    return {
        "audio_url": audio_url,
        "response_text": response_text,
        "escalate": escalate,
        "booking_detected": booking_detected,
        "booking_service": booking_service,
        "booking_step": booking_step,
    }


async def stream_voice_turn(
    transcription: str,
    agent,
    conversation_history: list[dict],
    call_context: dict | None = None,
) -> AsyncGenerator[dict, None]:
    """Streaming version of process_voice_turn.

    Yields one dict per sentence as audio becomes available, enabling
    the caller to start playing the first sentence while subsequent
    sentences are still being synthesized.

    Each yielded dict:
        {
            "audio_url": str,
            "response_text": str,      # Full response text (same in every chunk)
            "sentence": str,           # The sentence this audio chunk covers
            "escalate": bool,
            "booking_detected": bool,
            "is_first": bool,
            "is_last": bool,
        }
    """
    ctx = call_context or {}

    ai_result = await ai_brain.get_ai_response(
        user_message=transcription,
        conversation_history=conversation_history,
        agent=agent,
        call_context=ctx,
    )

    response_text: str = ai_result.get("response") or "I'll have someone call you right back."
    escalate: bool = bool(ai_result.get("escalate", False))
    booking_detected: bool = bool(ai_result.get("booking_detected", False))

    sentences = synthesis._split_sentences(response_text)
    total = len(sentences)

    async for i, url in _enumerate_async(
        synthesis.synthesize_sentences(
            text=response_text,
            language=getattr(agent, "language", "english") or "english",
            gender="female",
            voice_id=getattr(agent, "voice_id", None) or None,
        )
    ):
        sentence = sentences[i] if i < len(sentences) else ""
        yield {
            "audio_url": url,
            "response_text": response_text,
            "sentence": sentence,
            "escalate": escalate,
            "booking_detected": booking_detected,
            "is_first": i == 0,
            "is_last": i == total - 1,
        }


async def _enumerate_async(agen):  # type: ignore[type-arg]
    """Async version of enumerate() for async generators."""
    i = 0
    async for item in agen:
        yield i, item
        i += 1


async def transcribe_and_process(
    telnyx_transcript: str | None,
    telnyx_confidence: float | None,
    agent,
    conversation_history: list[dict],
    call_context: dict | None = None,
    audio_url: str | None = None,
    audio_bytes: bytes | None = None,
) -> dict:
    """Full pipeline: transcribe (with Deepgram fallback) then process.

    This is the entry point for the Telnyx webhook handler. It handles
    the Deepgram fallback logic before calling process_voice_turn().
    """
    # Resolve transcription — use Deepgram if Telnyx confidence is low
    transcription = await resolve_transcript(
        telnyx_transcript,
        telnyx_confidence,
        audio_url=audio_url,
        audio_bytes=audio_bytes,
        language=getattr(agent, "language", "english") or "english",
    )

    if not transcription or transcription == "[unclear]":
        return {
            "audio_url": "",
            "response_text": "",
            "escalate": False,
            "booking_detected": False,
            "booking_service": None,
            "booking_step": None,
            "unclear": True,
        }

    result = await process_voice_turn(
        transcription=transcription,
        agent=agent,
        conversation_history=conversation_history,
        call_context=call_context,
    )
    result["transcription"] = transcription
    result["unclear"] = False
    return result
