import telnyx 
from app.config import settings 

telnyx.api_key = settings.TELNYX_API_KEY 
 
async def answer_call(call_control_id: str) -> bool:
    try:
        call = telnyx.Call.retrieve(call_control_id)
        call.answer()
        return True
    except Exception:
        return False

async def play_audio(call_control_id: str, audio_url: str, client_state: str = "") -> bool:
    try:
        call = telnyx.Call.retrieve(call_control_id)
        call.playback_start(audio_url=audio_url, client_state=client_state)
        return True
    except Exception:
        return False

async def gather_speech(call_control_id: str, language_code: str) -> bool:
    try:
        call = telnyx.Call.retrieve(call_control_id)
        call.gather_using_speak(
            payload=" ", # We use silence because we just want to trigger the STT gather
            language=language_code,
            voice="female",
            input_type="speech"
        )
        return True
    except Exception:
        return False

async def transfer_call(call_control_id: str, to_number: str) -> bool:
    try:
        call = telnyx.Call.retrieve(call_control_id)
        call.transfer(to=to_number)
        return True
    except Exception:
        return False

async def end_call(call_control_id: str) -> bool:
    try:
        call = telnyx.Call.retrieve(call_control_id)
        call.hangup()
        return True
    except Exception:
        return False

async def send_digits(call_control_id: str, digits: str) -> bool:
    try:
        call = telnyx.Call.retrieve(call_control_id)
        call.send_dtmf(digits=digits)
        return True
    except Exception:
        return False
