from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
import httpx
import io
import logging

from app.config import settings

router = APIRouter(prefix="/preview", tags=["preview"])
logger = logging.getLogger("oneclerk")


class TTSRequest(BaseModel):
    text: str
    language: str = "en-US"
    voice: str = "alloy"
    agent_type: str = ""


OPENAI_VOICE_MAP = {
    "Maya — warm, mid-30s": "nova",
    "Arjun — calm, deep": "onyx",
    "Sofia — bright, friendly": "shimmer",
    "Daniel — professional": "echo",
    "Linh — soft, soothing": "alloy",
}

AGENT_SCRIPTS = {
    "Dental clinic front desk": {
        "en-US": "Hi, this is City Dental. How can I help you today? I can book a cleaning, look up your insurance, or transfer you to Doctor Patel.",
        "hi-IN": "नमस्ते, यह City Dental है। आज मैं आपकी कैसे मदद कर सकता हूं? मैं आपकी अपॉइंटमेंट बुक कर सकता हूं।",
        "es-ES": "Hola, habla City Dental. ¿En qué le puedo ayudar hoy? Puedo hacer una cita de limpieza o buscar su seguro.",
        "fr-FR": "Bonjour, ici City Dental. Comment puis-je vous aider aujourd'hui? Je peux réserver un nettoyage ou vérifier votre assurance.",
        "zh-CN": "您好，这是City Dental。今天我能帮您什么？我可以预约洗牙或查看您的保险。",
        "vi-VN": "Xin chào, đây là City Dental. Hôm nay tôi có thể giúp gì cho bạn? Tôi có thể đặt lịch hẹn hoặc kiểm tra bảo hiểm của bạn.",
        "ar-SA": "مرحبا، هذا City Dental. كيف يمكنني مساعدتك اليوم؟ يمكنني حجز موعد تنظيف أو الاطلاع على التأمين الخاص بك.",
        "pt-PT": "Olá, aqui é o City Dental. Como posso ajudá-lo hoje? Posso marcar uma limpeza ou verificar o seu seguro.",
    },
    "Hair salon receptionist": {
        "en-US": "Hello, you've reached Glow Salon, this is Maya. Are you calling to book with your usual stylist, or trying us for the first time?",
        "hi-IN": "नमस्ते, यह Glow Salon है। क्या आप अपने नियमित स्टाइलिस्ट के साथ बुकिंग करना चाहते हैं?",
        "es-ES": "Hola, has llamado a Glow Salon, soy Maya. ¿Llamas para hacer una cita con tu estilista habitual?",
        "fr-FR": "Bonjour, vous avez joint Glow Salon, c'est Maya. Appelez-vous pour prendre rendez-vous avec votre coiffeur habituel?",
        "zh-CN": "您好，这里是Glow Salon，我是Maya。您是要预约您的常用发型师，还是第一次来试试？",
        "vi-VN": "Xin chào, đây là Glow Salon, tôi là Maya. Bạn muốn đặt lịch với nhà tạo mẫu tóc thường xuyên của bạn không?",
        "ar-SA": "مرحبا، هذا صالون Glow، أنا مايا. هل تتصل لحجز موعد مع مصفف الشعر المعتاد لديك؟",
        "pt-PT": "Olá, ligou para o Glow Salon, sou a Maya. Está a ligar para marcar com o seu cabeleireiro habitual?",
    },
    "Restaurant host": {
        "en-US": "Good evening, thanks for calling Lumière. Would you like to book a table for tonight, or hear about our new winter tasting menu?",
        "es-ES": "Buenas tardes, gracias por llamar a Lumière. ¿Desea reservar una mesa para esta noche o conocer nuestro nuevo menú de degustación de invierno?",
        "fr-FR": "Bonsoir, merci d'appeler Lumière. Voulez-vous réserver une table pour ce soir ou entendre parler de notre nouveau menu dégustation d'hiver?",
        "zh-CN": "晚上好，感谢您致电Lumière。您想为今晚预订一张桌子，还是想了解我们新的冬季品鉴菜单？",
        "hi-IN": "शुभ संध्या, Lumière में कॉल करने के लिए धन्यवाद। क्या आप आज रात के लिए टेबल बुक करना चाहते हैं?",
        "vi-VN": "Chào buổi tối, cảm ơn bạn đã gọi cho Lumière. Bạn có muốn đặt bàn cho tối nay không?",
        "ar-SA": "مساء الخير، شكرا لاتصالك بـ Lumière. هل تريد حجز طاولة لهذه الليلة؟",
        "pt-PT": "Boa tarde, obrigado por ligar para o Lumière. Gostaria de reservar uma mesa para esta noite?",
    },
    "HVAC dispatcher": {
        "en-US": "Thanks for calling A and T Heating. Is your heat out right now? I can dispatch a tech, or schedule a tune up — which would you like?",
        "es-ES": "Gracias por llamar a A and T Heating. ¿Su calefacción está apagada ahora? Puedo enviar un técnico o programar un mantenimiento.",
        "fr-FR": "Merci d'appeler A and T Heating. Votre chauffage est-il en panne? Je peux envoyer un technicien ou planifier un entretien.",
        "zh-CN": "感谢您致电A and T Heating。您的暖气现在出了问题吗？我可以派一名技术人员，或者安排一次维护保养。",
        "hi-IN": "A and T Heating में कॉल करने के लिए धन्यवाद। क्या अभी आपकी हीटिंग बंद है? मैं एक तकनीशियन भेज सकता हूं।",
        "vi-VN": "Cảm ơn bạn đã gọi cho A and T Heating. Hệ thống sưởi của bạn có bị hỏng không? Tôi có thể cử kỹ thuật viên đến.",
        "ar-SA": "شكرا لاتصالك بـ A and T Heating. هل نظام التدفئة لديك معطل الآن؟ يمكنني إرسال تقني.",
        "pt-PT": "Obrigado por ligar para A and T Heating. O seu sistema de aquecimento está avariado agora? Posso enviar um técnico.",
    },
    "Law firm intake": {
        "en-US": "Jensen and Vega Law, this is the intake line. Can you tell me a bit about the matter so I can route you to the right partner?",
        "es-ES": "Jensen and Vega Law, esta es la línea de admisión. ¿Puede contarme un poco sobre el asunto para dirigirle al socio adecuado?",
        "fr-FR": "Jensen and Vega Law, c'est la ligne d'admission. Pouvez-vous me parler un peu de votre affaire pour que je vous dirige vers le bon associé?",
        "zh-CN": "Jensen and Vega Law律师事务所，这是咨询热线。能告诉我一下您的案件情况，以便我为您转接合适的合伙人吗？",
        "hi-IN": "Jensen and Vega Law, यह इनटेक लाइन है। क्या आप मुझे अपने मामले के बारे में थोड़ा बता सकते हैं?",
        "vi-VN": "Jensen and Vega Law, đây là đường dây tiếp nhận. Bạn có thể cho tôi biết một chút về vấn đề của bạn không?",
        "ar-SA": "Jensen and Vega Law، هذا خط الاستقبال. هل يمكنك إخباري قليلاً عن الأمر حتى أتمكن من توجيهك للشريك المناسب؟",
        "pt-PT": "Jensen and Vega Law, esta é a linha de atendimento. Pode dizer-me um pouco sobre o assunto para o encaminhar ao sócio certo?",
    },
}

LANG_CODE_MAP = {
    "English (US)": "en-US",
    "Hindi (हिंदी)": "hi-IN",
    "Spanish (Español)": "es-ES",
    "French (Français)": "fr-FR",
    "Mandarin (普通话)": "zh-CN",
    "Vietnamese (Tiếng Việt)": "vi-VN",
    "Arabic (العربية)": "ar-SA",
    "Portuguese (Português)": "pt-PT",
}


@router.post("/speak")
async def preview_speak(req: TTSRequest):
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="TTS not configured")

    lang_code = LANG_CODE_MAP.get(req.language, req.language)
    agent_scripts = AGENT_SCRIPTS.get(req.agent_type, {})
    text = agent_scripts.get(lang_code) or agent_scripts.get("en-US") or req.text
    if not text:
        text = req.text

    openai_voice = OPENAI_VOICE_MAP.get(req.voice, "nova")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/audio/speech",
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "tts-1",
                    "input": text,
                    "voice": openai_voice,
                    "response_format": "mp3",
                },
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail="TTS API error")

            audio_bytes = resp.content
            return StreamingResponse(
                io.BytesIO(audio_bytes),
                media_type="audio/mpeg",
                headers={
                    "Cache-Control": "no-store",
                    "X-Agent-Script": text[:200],
                },
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="TTS request timed out")
    except Exception as e:
        logger.error(f"TTS preview error: {e}")
        raise HTTPException(status_code=500, detail="TTS error")


@router.get("/script")
async def preview_script(agent_type: str = "", language: str = "en-US"):
    lang_code = LANG_CODE_MAP.get(language, language)
    agent_scripts = AGENT_SCRIPTS.get(agent_type, {})
    text = agent_scripts.get(lang_code) or agent_scripts.get("en-US", "Hello, thank you for calling. How can I help you today?")
    return {"text": text, "lang_code": lang_code}
