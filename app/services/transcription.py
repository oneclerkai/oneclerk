from __future__ import annotations

from app.config import settings

try:
    from deepgram import DeepgramClient, PrerecordedOptions
except ImportError:  # pragma: no cover
    DeepgramClient = None  # type: ignore[assignment]
    PrerecordedOptions = None  # type: ignore[assignment]


LANGUAGE_MAP = {
    "english": "en",
    "hindi": "hi",
    "arabic": "ar",
    "tamil": "ta",
    "spanish": "es",
}

deepgram = (
    DeepgramClient(settings.DEEPGRAM_API_KEY)
    if DeepgramClient is not None and settings.DEEPGRAM_API_KEY
    else None
)


async def transcribe_audio_url(audio_url: str, language: str = "en") -> str:
    if deepgram is None or PrerecordedOptions is None:
        return ""

    options = PrerecordedOptions(
        model="nova-2",
        language=LANGUAGE_MAP.get(language.lower(), "en"),
        smart_format=True,
        punctuate=True,
        filler_words=False,
        utterances=False,
    )
    source = {"url": audio_url}
    response = await deepgram.listen.asyncprerecorded.v("1").transcribe_url(
        source, options
    )
    alternative = response.results.channels[0].alternatives[0]
    if alternative.confidence < 0.6:
        return "[unclear]"
    return alternative.transcript.strip()


async def transcribe_audio_bytes(audio_bytes: bytes, language: str = "en") -> str:
    if deepgram is None or PrerecordedOptions is None:
        return ""

    options = PrerecordedOptions(
        model="nova-2",
        language=LANGUAGE_MAP.get(language.lower(), "en"),
        smart_format=True,
        punctuate=True,
    )
    source = {"buffer": audio_bytes, "mimetype": "audio/wav"}
    response = await deepgram.listen.asyncprerecorded.v("1").transcribe_file(
        source, options
    )
    return response.results.channels[0].alternatives[0].transcript.strip()


async def resolve_transcript(
    telnyx_transcription: str | None,
    telnyx_confidence: float | None,
    *,
    audio_url: str | None = None,
    audio_bytes: bytes | None = None,
    language: str = "english",
) -> str:
    if (
        settings.USE_TELNYX_STT
        and telnyx_transcription
        and (telnyx_confidence is None or telnyx_confidence >= settings.DEEPGRAM_FALLBACK_CONFIDENCE)
    ):
        return telnyx_transcription.strip()
    if audio_url:
        return await transcribe_audio_url(audio_url, language=language)
    if audio_bytes:
        return await transcribe_audio_bytes(audio_bytes, language=language)
    return (telnyx_transcription or "").strip()
