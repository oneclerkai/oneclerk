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

# Use Replit AI Integrations (no personal API key required) if available,
# otherwise fall back to the user-supplied OPENAI_API_KEY.
_ai_base_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")
_ai_key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or settings.OPENAI_API_KEY

client = (
    AsyncOpenAI(api_key=_ai_key, base_url=_ai_base_url or None)
    if AsyncOpenAI is not None and _ai_key
    else None
)

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
    services = ", ".join(_service_names(context.get("services", [])))
    faq_text = "\n".join(
        f"Q: {item['question']} A: {item['answer']}" for item in _faq_pairs(context.get("faqs", []))
    )
    timezone_str = context.get("timezone", "Asia/Kolkata")
    return f"""You are {agent.name}, AI receptionist for {context.get('business_name', agent.name)}.

BUSINESS INFO:
- Hours: {context.get('hours') or context.get('operating_hours', 'Mon-Sat 9am-6pm')}
- Services: {services or 'General business support'}
- Address: {context.get('address') or context.get('location', 'Please ask for our address')}
- Timezone: {timezone_str}

FAQS:
{faq_text}

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
    result = json.loads(response.choices[0].message.content or "{}")
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
