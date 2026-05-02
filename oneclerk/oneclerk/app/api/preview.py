from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional, List
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


class ChatMessage(BaseModel):
    role: str
    content: str


class ConversationRequest(BaseModel):
    messages: List[ChatMessage]
    agent_type: str = "Dental clinic front desk"
    language: str = "en-US"
    business_name: Optional[str] = None


OPENAI_VOICE_MAP = {
    "Maya — warm, mid-30s":       "nova",
    "Arjun — calm, deep":         "onyx",
    "Sofia — bright, friendly":   "shimmer",
    "Daniel — professional":      "echo",
    "Linh — soft, soothing":      "alloy",
    "Isabella — elegant":         "nova",
    "Marcus — authoritative":     "onyx",
}

LANG_CODE_MAP = {
    "English (US)":           "en-US",
    "Hindi (हिंदी)":           "hi-IN",
    "Spanish (Español)":      "es-ES",
    "French (Français)":      "fr-FR",
    "Mandarin (普通话)":       "zh-CN",
    "Vietnamese (Tiếng Việt)": "vi-VN",
    "Arabic (العربية)":       "ar-SA",
    "Portuguese (Português)": "pt-PT",
    "German (Deutsch)":       "de-DE",
    "Japanese (日本語)":       "ja-JP",
}

AGENT_SCRIPTS: dict[str, dict[str, str]] = {
    "Dental clinic front desk": {
        "en-US": "Hi, this is City Dental. How can I help you today? I can book a cleaning, look up your insurance, or transfer you to Doctor Patel.",
        "hi-IN": "नमस्ते, यह City Dental है। आज मैं आपकी कैसे मदद कर सकता हूं? मैं आपकी अपॉइंटमेंट बुक कर सकता हूं।",
        "es-ES": "Hola, habla City Dental. ¿En qué le puedo ayudar hoy? Puedo hacer una cita de limpieza o buscar su seguro.",
        "fr-FR": "Bonjour, ici City Dental. Comment puis-je vous aider aujourd'hui? Je peux réserver un nettoyage ou vérifier votre assurance.",
        "zh-CN": "您好，这是City Dental。今天我能帮您什么？我可以预约洗牙或查看您的保险。",
        "vi-VN": "Xin chào, đây là City Dental. Hôm nay tôi có thể giúp gì cho bạn? Tôi có thể đặt lịch hẹn hoặc kiểm tra bảo hiểm của bạn.",
        "ar-SA": "مرحبا، هذا City Dental. كيف يمكنني مساعدتك اليوم؟ يمكنني حجز موعد تنظيف أو الاطلاع على التأمين الخاص بك.",
        "pt-PT": "Olá, aqui é o City Dental. Como posso ajudá-lo hoje? Posso marcar uma limpeza ou verificar o seu seguro.",
        "de-DE": "Hallo, hier ist City Dental. Wie kann ich Ihnen heute helfen? Ich kann einen Reinigungstermin buchen oder Ihre Versicherung nachschlagen.",
        "ja-JP": "こんにちは、City Dentalです。本日はどのようなご用件でしょうか？クリーニングの予約や保険の確認ができます。",
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
        "de-DE": "Hallo, hier ist Glow Salon, ich bin Maya. Möchten Sie einen Termin bei Ihrem gewohnten Stylisten buchen?",
        "ja-JP": "こんにちは、Glow Salonのマヤです。いつもの担当スタイリストの予約ですか、それとも初めてのご来店でしょうか？",
    },
    "Restaurant host": {
        "en-US": "Good evening, thanks for calling Lumière. Would you like to book a table for tonight, or hear about our new winter tasting menu?",
        "es-ES": "Buenas tardes, gracias por llamar a Lumière. ¿Desea reservar una mesa para esta noche o conocer nuestro nuevo menú de degustación?",
        "fr-FR": "Bonsoir, merci d'appeler Lumière. Voulez-vous réserver une table pour ce soir ou entendre parler de notre menu dégustation d'hiver?",
        "zh-CN": "晚上好，感谢致电Lumière。您想为今晚预订餐桌，还是了解我们的冬季品鉴菜单？",
        "hi-IN": "शुभ संध्या, Lumière में कॉल करने के लिए धन्यवाद। क्या आप आज रात टेबल बुक करना चाहते हैं?",
        "vi-VN": "Chào buổi tối, cảm ơn bạn đã gọi cho Lumière. Bạn muốn đặt bàn cho tối nay không?",
        "ar-SA": "مساء الخير، شكرا لاتصالك بـ Lumière. هل تريد حجز طاولة لهذه الليلة؟",
        "pt-PT": "Boa tarde, obrigado por ligar para Lumière. Gostaria de reservar uma mesa para esta noite?",
        "de-DE": "Guten Abend, danke für Ihren Anruf bei Lumière. Möchten Sie einen Tisch reservieren oder mehr über unser Wintermenü erfahren?",
        "ja-JP": "こんばんは、Lumièreにお電話いただきありがとうございます。本日のご予約、または冬の試食メニューについてお聞きになりますか？",
    },
    "HVAC dispatcher": {
        "en-US": "Thanks for calling A&T Heating. Is your heat out right now? I can dispatch a tech within the hour or schedule a tune-up — which would you prefer?",
        "es-ES": "Gracias por llamar a A&T Heating. ¿Su calefacción está apagada ahora? Puedo enviar un técnico en una hora.",
        "fr-FR": "Merci d'appeler A&T Heating. Votre chauffage est en panne? Je peux envoyer un technicien dans l'heure.",
        "zh-CN": "感谢致电A&T Heating。您的暖气出问题了吗？我可以在一小时内派技术人员上门。",
        "hi-IN": "A&T Heating में कॉल करने के लिए धन्यवाद। क्या अभी आपकी हीटिंग बंद है? मैं एक घंटे में तकनीशियन भेज सकता हूं।",
        "vi-VN": "Cảm ơn đã gọi cho A&T Heating. Hệ thống sưởi của bạn có bị hỏng không? Tôi có thể cử kỹ thuật viên đến trong vòng một giờ.",
        "ar-SA": "شكرا لاتصالك بـ A&T Heating. هل نظام التدفئة لديك معطل الآن؟ يمكنني إرسال تقني خلال ساعة.",
        "pt-PT": "Obrigado por ligar para A&T Heating. O seu aquecimento avariou? Posso enviar um técnico dentro de uma hora.",
        "de-DE": "Danke für Ihren Anruf bei A&T Heating. Ist Ihre Heizung ausgefallen? Ich kann innerhalb einer Stunde einen Techniker schicken.",
        "ja-JP": "A&Tヒーティングにお電話いただきありがとうございます。暖房が故障していますか？1時間以内に技術者を派遣できます。",
    },
    "Law firm intake": {
        "en-US": "Jensen & Vega Law, intake line. Can you tell me a bit about your matter so I can connect you with the right partner?",
        "es-ES": "Jensen & Vega Law, línea de admisión. ¿Puede contarme sobre su asunto para dirigirle al socio adecuado?",
        "fr-FR": "Jensen & Vega Law, ligne d'admission. Pouvez-vous me parler de votre affaire pour vous diriger vers le bon associé?",
        "zh-CN": "Jensen & Vega Law律师事务所咨询热线。能告诉我一下您的案件，以便转接合适的律师？",
        "hi-IN": "Jensen & Vega Law, इनटेक लाइन। क्या आप अपने मामले के बारे में बता सकते हैं ताकि मैं सही वकील से जोड़ सकूं?",
        "vi-VN": "Jensen & Vega Law, đường dây tiếp nhận. Bạn có thể cho tôi biết về vấn đề của bạn không?",
        "ar-SA": "Jensen & Vega Law، خط الاستقبال. هل يمكنك إخباري عن أمرك حتى أوجهك للشريك المناسب؟",
        "pt-PT": "Jensen & Vega Law, linha de atendimento. Pode dizer-me sobre o seu assunto para o encaminhar ao sócio certo?",
        "de-DE": "Jensen & Vega Law, Aufnahmeleitung. Können Sie mir Ihr Anliegen schildern, damit ich Sie mit dem richtigen Partner verbinde?",
        "ja-JP": "Jensen & Vega法律事務所、受付窓口です。どのようなご用件か教えていただけますか？適切な担当者におつなぎします。",
    },
    "Hotel concierge": {
        "en-US": "The Grand Meridian, good morning. How may I assist you today? I can help with reservations, room service, or local recommendations.",
        "es-ES": "Grand Meridian, buenos días. ¿En qué puedo ayudarle? Puedo ayudarle con reservas, servicio de habitaciones o recomendaciones locales.",
        "fr-FR": "Grand Meridian, bonjour. Comment puis-je vous aider? Je peux vous aider avec des réservations, le service en chambre ou des recommandations locales.",
        "zh-CN": "大经线酒店，您好。我可以帮您办理预订、客房服务或推荐当地景点。",
        "hi-IN": "Grand Meridian, सुप्रभात। मैं आपकी कैसे मदद कर सकता हूं? रिजर्वेशन, रूम सर्विस या स्थानीय सिफारिशें।",
        "vi-VN": "Grand Meridian, xin chào buổi sáng. Tôi có thể giúp gì cho bạn? Đặt phòng, dịch vụ phòng hoặc gợi ý địa phương.",
        "ar-SA": "Grand Meridian، صباح الخير. كيف يمكنني مساعدتك؟ يمكنني المساعدة في الحجوزات أو خدمة الغرف أو التوصيات المحلية.",
        "pt-PT": "Grand Meridian, bom dia. Como posso ajudá-lo? Posso ajudar com reservas, serviço de quarto ou recomendações locais.",
        "de-DE": "Grand Meridian, guten Morgen. Wie kann ich Ihnen helfen? Ich helfe bei Reservierungen, Zimmerservice oder lokalen Empfehlungen.",
        "ja-JP": "グランドメリディアンホテル、おはようございます。ご予約、ルームサービス、または地元のおすすめについてお手伝いできます。",
    },
    "Medical clinic": {
        "en-US": "Riverside Medical, this is your AI assistant. I can help you schedule an appointment, get a refill, or connect you with a nurse. What do you need today?",
        "es-ES": "Riverside Medical, soy su asistente de IA. Puedo ayudarle a programar una cita, obtener una recarga o conectarle con una enfermera.",
        "fr-FR": "Riverside Medical, je suis votre assistant IA. Je peux vous aider à prendre rendez-vous, obtenir un renouvellement ou vous mettre en relation avec une infirmière.",
        "zh-CN": "Riverside医疗中心，我是您的AI助手。我可以帮您预约、续药或联系护士。",
        "hi-IN": "Riverside Medical, मैं आपका AI सहायक हूं। मैं अपॉइंटमेंट बुक करने, दवा रिफिल या नर्स से जोड़ने में मदद कर सकता हूं।",
        "vi-VN": "Riverside Medical, tôi là trợ lý AI của bạn. Tôi có thể giúp đặt lịch hẹn, gia hạn thuốc hoặc kết nối với y tá.",
        "ar-SA": "Riverside Medical، أنا مساعدك الذكي. يمكنني مساعدتك في حجز موعد أو تجديد وصفة أو التواصل مع ممرضة.",
        "pt-PT": "Riverside Medical, sou o seu assistente IA. Posso ajudá-lo a marcar uma consulta, renovar uma receita ou conectá-lo com uma enfermeira.",
        "de-DE": "Riverside Medical, ich bin Ihr KI-Assistent. Ich kann Ihnen bei Terminvereinbarungen, Nachfüllungen oder der Verbindung mit einer Krankenschwester helfen.",
        "ja-JP": "Riverside医療センターのAIアシスタントです。予約、薬の補充、または看護師への取り次ぎをお手伝いできます。",
    },
    "Gym & fitness studio": {
        "en-US": "Hey! Thanks for calling FitPulse. Looking to book a class, ask about membership, or talk to a trainer? I've got you covered!",
        "es-ES": "¡Hola! Gracias por llamar a FitPulse. ¿Quieres reservar una clase, preguntar sobre membresía o hablar con un entrenador?",
        "fr-FR": "Salut! Merci d'appeler FitPulse. Vous souhaitez réserver un cours, vous renseigner sur l'abonnement ou parler à un coach?",
        "zh-CN": "嘿！感谢致电FitPulse。想预约课程、了解会员资格还是联系教练？",
        "hi-IN": "हे! FitPulse में कॉल करने के लिए धन्यवाद। क्लास बुक करना है, मेम्बरशिप के बारे में पूछना है या ट्रेनर से बात करनी है?",
        "vi-VN": "Chào! Cảm ơn đã gọi FitPulse. Bạn muốn đặt lớp học, hỏi về thành viên hoặc nói chuyện với huấn luyện viên?",
        "ar-SA": "مرحبا! شكرا لاتصالك بـ FitPulse. هل تريد حجز فصل أو الاستفسار عن العضوية أو التحدث مع مدرب؟",
        "pt-PT": "Olá! Obrigado por ligar para FitPulse. Quer reservar uma aula, saber sobre a adesão ou falar com um treinador?",
        "de-DE": "Hey! Danke für Ihren Anruf bei FitPulse. Möchten Sie einen Kurs buchen, sich über die Mitgliedschaft informieren oder mit einem Trainer sprechen?",
        "ja-JP": "こんにちは！FitPulseにお電話いただきありがとうございます。クラスの予約、会員について、またはトレーナーとの相談、何でもお手伝いします！",
    },
}

AGENT_SYSTEM_PROMPTS: dict[str, str] = {
    "Dental clinic front desk": (
        "You are a warm, professional AI receptionist for City Dental. "
        "Help callers book appointments, check insurance, handle cancellations, and transfer to the dentist for clinical questions. "
        "Keep responses concise and friendly, under 2 sentences. Always offer a clear next step."
    ),
    "Hair salon receptionist": (
        "You are Maya, a friendly AI receptionist for Glow Salon. "
        "Help callers book appointments, check stylist availability, and answer basic pricing questions. "
        "Be warm and conversational. Keep responses under 2 sentences."
    ),
    "Restaurant host": (
        "You are an elegant AI host for Lumière restaurant. "
        "Help callers make reservations, check availability, hear the menu, and handle dietary requirements. "
        "Maintain a sophisticated, welcoming tone. Keep responses concise."
    ),
    "HVAC dispatcher": (
        "You are an efficient AI dispatcher for A&T Heating & Cooling. "
        "Help callers report issues, schedule emergency repairs, routine maintenance, or tune-ups. "
        "Prioritize urgency (no heat/AC in extreme weather). Keep responses clear and actionable."
    ),
    "Law firm intake": (
        "You are a professional AI intake coordinator for Jensen & Vega Law. "
        "Gather the caller's name, matter type, and urgency. Route to the correct practice area partner. "
        "Maintain strict confidentiality. Keep responses professional and concise."
    ),
    "Hotel concierge": (
        "You are a gracious AI concierge for The Grand Meridian hotel. "
        "Help guests with reservations, check-in/out questions, room service, amenities, and local recommendations. "
        "Be attentive and sophisticated. Keep responses brief."
    ),
    "Medical clinic": (
        "You are a compassionate AI assistant for Riverside Medical. "
        "Help patients schedule appointments, request prescription refills, and handle urgent triage. "
        "For any medical emergencies, direct to 911. Keep responses clear and empathetic."
    ),
    "Gym & fitness studio": (
        "You are an energetic AI assistant for FitPulse fitness studio. "
        "Help callers book classes, check schedules, learn about memberships, and connect with trainers. "
        "Be upbeat and motivating. Keep responses short and friendly."
    ),
}


async def _synthesize_speech(text: str, voice: str, timeout: float = 15.0) -> bytes:
    openai_voice = OPENAI_VOICE_MAP.get(voice, "nova")
    async with httpx.AsyncClient(timeout=timeout) as client:
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
            raise HTTPException(status_code=502, detail=f"TTS API error: {resp.text[:200]}")
        return resp.content


@router.post("/speak")
async def preview_speak(req: TTSRequest):
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="TTS not configured — add OPENAI_API_KEY")

    lang_code = LANG_CODE_MAP.get(req.language, req.language)
    agent_scripts = AGENT_SCRIPTS.get(req.agent_type, {})
    text = agent_scripts.get(lang_code) or agent_scripts.get("en-US") or req.text
    if not text:
        text = req.text

    try:
        audio_bytes = await _synthesize_speech(text, req.voice)
        return StreamingResponse(
            io.BytesIO(audio_bytes),
            media_type="audio/mpeg",
            headers={
                "Cache-Control": "no-store",
                "X-Agent-Script": text[:200],
                "X-Agent-Type": req.agent_type,
                "X-Language": lang_code,
            },
        )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="TTS request timed out")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TTS preview error: {e}")
        raise HTTPException(status_code=500, detail="TTS error")


@router.post("/chat")
async def preview_chat(req: ConversationRequest):
    """Simulate a live conversation with the AI receptionist."""
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="AI not configured — add OPENAI_API_KEY")

    lang_code = LANG_CODE_MAP.get(req.language, req.language)
    system_prompt = AGENT_SYSTEM_PROMPTS.get(
        req.agent_type,
        "You are a professional AI receptionist. Be helpful, concise, and friendly."
    )
    if req.business_name:
        system_prompt = system_prompt.replace("City Dental", req.business_name)
        system_prompt = system_prompt.replace("Glow Salon", req.business_name)
        system_prompt = system_prompt.replace("Lumière", req.business_name)

    opening = AGENT_SCRIPTS.get(req.agent_type, {}).get(lang_code) or \
              AGENT_SCRIPTS.get(req.agent_type, {}).get("en-US", "Hello, how can I help you?")

    system_prompt += f"\n\nYou opened the call with: \"{opening}\"\n"
    system_prompt += "The caller is now responding. Continue the conversation naturally."
    if lang_code != "en-US":
        system_prompt += f" Respond in the same language as the caller (language code: {lang_code})."

    messages = [{"role": "system", "content": system_prompt}]
    messages += [{"role": m.role, "content": m.content} for m in req.messages]

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.OPENAI_MODEL,
                    "messages": messages,
                    "max_tokens": 150,
                    "temperature": 0.7,
                },
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail="AI API error")

            data = resp.json()
            reply = data["choices"][0]["message"]["content"].strip()
            return {"reply": reply, "agent_type": req.agent_type, "language": lang_code}

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="AI request timed out")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat preview error: {e}")
        raise HTTPException(status_code=500, detail="Chat error")


@router.post("/chat-speak")
async def preview_chat_speak(req: ConversationRequest):
    """Get an AI reply and speak it — single endpoint for live demo."""
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="AI not configured — add OPENAI_API_KEY")

    chat_result = await preview_chat(req)
    reply_text = chat_result["reply"]

    voice = "Maya — warm, mid-30s"
    try:
        audio_bytes = await _synthesize_speech(reply_text, voice)
        return StreamingResponse(
            io.BytesIO(audio_bytes),
            media_type="audio/mpeg",
            headers={
                "Cache-Control": "no-store",
                "X-Agent-Reply": reply_text[:200],
            },
        )
    except Exception as e:
        logger.error(f"Chat-speak error: {e}")
        raise HTTPException(status_code=500, detail="Speech synthesis error")


@router.get("/script")
async def preview_script(agent_type: str = "", language: str = "en-US"):
    lang_code = LANG_CODE_MAP.get(language, language)
    agent_scripts = AGENT_SCRIPTS.get(agent_type, {})
    text = agent_scripts.get(lang_code) or agent_scripts.get("en-US", "Hello, thank you for calling. How can I help you today?")
    return {"text": text, "lang_code": lang_code}


@router.get("/agents")
async def list_preview_agents():
    """List all available demo agent types with their supported languages."""
    return {
        "agents": [
            {
                "type": agent_type,
                "languages": list(scripts.keys()),
                "has_system_prompt": agent_type in AGENT_SYSTEM_PROMPTS,
            }
            for agent_type, scripts in AGENT_SCRIPTS.items()
        ],
        "voices": list(OPENAI_VOICE_MAP.keys()),
        "language_names": list(LANG_CODE_MAP.keys()),
    }
