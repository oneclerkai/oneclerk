from __future__ import annotations

import hashlib
import json
from typing import Any

from app.config import settings
from app.services.redis_client import safe_get, safe_setex

import os

try:
    from openai import AsyncOpenAI
except ImportError:  # pragma: no cover
    AsyncOpenAI = None  # type: ignore[assignment]

# Initialize an AsyncOpenAI client that can point to OpenAI or OpenRouter
def _init_client() -> "AsyncOpenAI" | None:
    if AsyncOpenAI is None:
        return None

    # Prefer an explicit OpenRouter key if provided
    if settings.OPENROUTER_API_KEY:
        return AsyncOpenAI(
            api_key=settings.OPENROUTER_API_KEY,
            base_url="https://openrouter.ai/api/v1",
            default_headers={
                "HTTP-Referer": "https://oneclerk.ai",
                "X-Title": "OneClerk Voice Agent Pipeline",
            },
        )

    # Fallback to a generic base URL or the built-in OpenAI key
    _ai_base_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")
    _ai_key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or settings.OPENAI_API_KEY
    if _ai_key:
        return AsyncOpenAI(api_key=_ai_key, base_url=_ai_base_url or None)
    return None


client = _init_client()

URGENT_WORDS: tuple[str, ...] = (
    "emergency",
    "urgent",
    "critical",
    "pain",
    "accident",
    "immediately",
    "right now",
    "help",
    "dying",
    "bleeding",
)

BOOKING_WORDS: tuple[str, ...] = (
    "book",
    "appointment",
    "schedule",
    "reserve",
    "slot",
    "available",
    "when can",
    "tomorrow",
    "monday",
    "tuesday",
)


def _service_names(services: Any) -> list[str]:
    if isinstance(services, list):
        out: list[str] = []
        for service in services:
            if isinstance(service, dict):
                out.append(str(service.get("name", "")).strip())
            else:
                out.append(str(service).strip())
        return [item for item in out if item]
    if isinstance(services, str):
        return [item.strip() for item in services.split(",") if item.strip()]
    return []


def _faq_pairs(faqs: Any) -> list[dict]:
    if isinstance(faqs, list):
        return [item for item in faqs if isinstance(item, dict)]
    if isinstance(faqs, str):
        lines = [line.strip() for line in faqs.splitlines() if line.strip()]
        pairs: list[dict] = []
        current_question = ""
        for line in lines:
            if line.lower().startswith("q:"):
                current_question = line[2:].strip()
            elif line.lower().startswith("a:") and current_question:
                pairs.append({"question": current_question, "answer": line[2:].strip()})
                current_question = ""
        return pairs
    return []


def build_system_prompt(agent) -> str:
    context = agent.business_context if hasattr(agent, "business_context") else (agent.config or {})

    # Resolve all fields — new canvas keys take priority, old keys are fallbacks
    biz_name    = (context.get("business_name") or "").strip() or agent.name
    biz_hours   = (context.get("business_hours") or context.get("operating_hours") or "Mon-Sat 9am-6pm").strip()
    biz_address = (context.get("business_address") or context.get("address") or context.get("location") or "Please ask for our address").strip()
    biz_url     = (context.get("business_url") or "").strip()
    biz_info    = (context.get("business_info") or "").strip()
    agent_persona = (context.get("agent_persona") or "").strip()
    pricing     = (context.get("business_pricing") or context.get("pricing") or "").strip()
    timezone_str = context.get("timezone", "Asia/Kolkata")

    # Services: prefer business_services (canvas), fallback to services
    raw_services = context.get("business_services") or context.get("services") or ""
    services = ", ".join(_service_names(raw_services)) if raw_services else "General business support"

    # FAQs: prefer business_faq (canvas), fallback to faqs
    raw_faqs = context.get("business_faq") or context.get("faqs") or ""
    faq_text = "\n".join(
        f"Q: {item['question']} A: {item['answer']}" for item in _faq_pairs(raw_faqs)
    ) if raw_faqs else ""

    persona_block = f"\nAGENT PERSONA:\n{agent_persona}\n" if agent_persona else ""
    pricing_line  = f"\n- Pricing: {pricing}" if pricing else ""
    url_line      = f"\n- Website: {biz_url}" if biz_url else ""
    info_block    = f"\nADDITIONAL CONTEXT:\n{biz_info}\n" if biz_info else ""

    return f"""You are {agent.name}, AI receptionist for {biz_name}.{persona_block}
BUSINESS INFO:
- Hours: {biz_hours}
- Services: {services}
- Address: {biz_address}{pricing_line}{url_line}
- Timezone: {timezone_str}
{info_block}
FAQS:
{faq_text or 'None on file — answer best you can or offer a callback.'}

BOOKING RULES (TWO-STEP — CRITICAL):
Step 1: When the caller asks to book, FIRST check availability and propose exactly TWO specific
        time slots in {timezone_str} timezone (e.g. "I have Tuesday 3 PM or Wednesday 10 AM").
        Set booking_step="propose" in your response.
Step 2: Only after the caller confirms one slot, confirm the booking.
        Set booking_detected=true and booking_step="confirm" in your response.
Never book without explicit caller confirmation of a specific slot.

RULES (CRITICAL - follow exactly):
1. Max 35 words per response (this is voice, not text)
2. Always end with a question to keep conversation going
3. For appointments: follow the TWO-STEP booking process above
4. For unknown info: "Let me have someone call you right back"
5. Escalation words {context.get('escalation_keywords', ['emergency','urgent'])}:
   say "Let me connect you immediately" then set escalate=true
6. Never claim to be human if sincerely asked

RESPONSE FORMAT - Always respond with ONLY this JSON:
{{"response": "your spoken response here", "escalate": false, "booking_detected": false, "booking_service": null, "booking_step": null}}"""


def _normalize_ai_response(result: dict) -> dict:
    if not isinstance(result, dict):
        return {
            "response": "I have your request and someone will follow up shortly. What else can I note for you?",
            "escalate": False,
            "booking_detected": False,
            "booking_service": None,
            "booking_step": None,
        }

    booking_step = str(result.get("booking_step") or "").lower()
    if booking_step not in ("propose", "confirm"):
        booking_step = None

    booking_detected = bool(result.get("booking_detected")) and booking_step == "confirm"
    return {
        "response": str(result.get("response") or "I have your request and someone will follow up shortly. What else can I note for you?"),
        "escalate": bool(result.get("escalate")),
        "booking_detected": booking_detected,
        "booking_service": result.get("booking_service"),
        "booking_step": booking_step,
    }


async def get_ai_response(
    user_message: str,
    conversation_history: list,
    agent,
    call_context: dict | None = None,
) -> dict:
    if client is None:
        return {
            "response": "Thanks for calling. I have your message and someone will call you right back. What else can I note for them?",
            "escalate": False,
            "booking_detected": False,
            "booking_service": None,
            "booking_step": None,
        }

    cache_key = f"ai_resp:{agent.id}:{hashlib.md5(user_message.lower().encode()).hexdigest()}"
    cached = await safe_get(cache_key)
    if cached:
        return json.loads(cached.decode() if isinstance(cached, bytes) else cached)

    recent_history = conversation_history[-6:] if len(conversation_history) > 6 else conversation_history
    messages = [{"role": "system", "content": build_system_prompt(agent)}]
    messages.extend(recent_history)
    messages.append({"role": "user", "content": user_message})

    response = await client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=messages,
        max_tokens=80,
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    raw = json.loads(response.choices[0].message.content or "{}")
    result = _normalize_ai_response(raw)
    if not result.get("escalate") and not result.get("booking_detected"):
        await safe_setex(cache_key, 3600, json.dumps(result))
    return result


async def generate_call_summary(conversation: list, agent) -> dict:
    if client is None:
        return {
            "summary": "Call completed without AI summary because OpenAI is not configured.",
            "appointment_booked": False,
            "appointment_service": None,
            "caller_intent": "unknown",
            "needs_followup": True,
        }
    messages = [
        {
            "role": "system",
            "content": "Summarize this call in 2 sentences. Return JSON: {summary: str, appointment_booked: bool, appointment_service: str|null, caller_intent: str, needs_followup: bool}",
        },
        {"role": "user", "content": f"Call transcript:\n{json.dumps(conversation)}"},
    ]
    response = await client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=messages,
        max_tokens=150,
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content or "{}")


async def detect_urgency(text: str) -> bool:
    text_lower = text.lower()
    return any(word in text_lower for word in URGENT_WORDS)


async def detect_booking_intent(text: str) -> bool:
    text_lower = text.lower()
    return any(word in text_lower for word in BOOKING_WORDS)
