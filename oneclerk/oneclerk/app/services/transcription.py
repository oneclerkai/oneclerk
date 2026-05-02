import logging
from deepgram import DeepgramClient, PrerecordedOptions
from app.config import settings

logger = logging.getLogger(__name__)

async def transcribe_audio(audio_url: str) -> str:
    """Transcribe audio using Deepgram Nova-2."""
    if not settings.DEEPGRAM_API_KEY:
        logger.error("DEEPGRAM_API_KEY not configured")
        return ""

    try:
        deepgram = DeepgramClient(settings.DEEPGRAM_API_KEY)
        
        options = PrerecordedOptions(
            model="nova-2",
            smart_format=True,
        )

        source = {"url": audio_url}
        response = deepgram.listen.prerecorded.v("1").transcribe_url(source, options)
        
        transcript = response.results.channels[0].alternatives[0].transcript
        return transcript
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        return ""
