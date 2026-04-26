"""The intelligence layer for Rinq. Every call passes through here."""
from __future__ import annotations

from typing import Iterable

from app.config import settings

try:
    from openai import AsyncOpenAI
except ImportError:  # pragma: no cover
    AsyncOpenAI = None  # type: ignore[assignment]


SYSTEM_TEMPLATE = """You are {agent_name}, the AI receptionist for {business_name}.

Business Type: {business_type}
Operating Hours: {operating_hours}
Services: {services}
Location: {location}
Pricing: {pricing}
Common FAQs: {faqs}
Booking Instructions: {booking_instructions}
Escalation Triggers: {escalation_triggers}

YOUR RULES:
1. You speak naturally and warmly like a real receptionist.
2. Keep responses under 40 words unless the caller asks for detailed info.
3. If asked something not in your knowledge say "Let me have {owner_name} call you back about that specifically".
4. If you detect words like emergency, urgent, pain, accident, critical — say "I'm flagging this as urgent and {owner_name} will call you back within 5 minutes".
5. Always confirm bookings with day, date, time, and what they booked.
6. End every call by asking "Is there anything else I can help you with?".
7. Speak in the caller's language if they speak Hindi, Tamil, or any regional language.
8. Never say you are an AI unless directly asked.
9. If directly asked if you are an AI say "I'm an AI assistant for {business_name}, but I'm fully trained on everything about this business".

Current conversation language: {language}
"""

URGENT_WORDS: tuple[str, ...] = (
    "emergency", "urgent", "critical", "pain", "accident",
    "immediately", "right now", "help", "dying", "bleeding",
    "जरूरी", "इमरजेंसी", "दर्द", "अभी",
)

BOOKING_WORDS: tuple[str, ...] = (
    "book", "appointment", "schedule", "reserve", "slot",
    "available", "when can", "tomorrow", "monday", "tuesday",
    "बुक", "अपॉइंटमेंट", "समय",
)


def _client() -> "AsyncOpenAI | None":
    if not settings.OPENAI_API_KEY or AsyncOpenAI is None:
        return None
    return AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


def _format_system_prompt(agent_config: dict) -> str:
    defaults = {
        "agent_name": "Rinq",
        "business_name": "this business",
        "business_type": "general",
        "operating_hours": "9 AM to 6 PM",
        "services": "",
        "location": "",
        "pricing": "",
        "faqs": "",
        "booking_instructions": "",
        "escalation_triggers": ", ".join(URGENT_WORDS[:6]),
        "owner_name": "the owner",
        "language": "English",
    }
    merged = {**defaults, **{k: v for k, v in agent_config.items() if v is not None}}
    return SYSTEM_TEMPLATE.format(**merged)


async def get_ai_response(
    conversation_history: Iterable[dict],
    agent_config: dict,
    caller_message: str,
) -> str:
    client = _client()
    if client is None:
        # Graceful fallback when no OpenAI key is configured.
        return (
            "Thanks for calling. I've noted what you said and "
            f"{agent_config.get('owner_name', 'the owner')} will get back to you shortly."
        )

    system_prompt = _format_system_prompt(agent_config)
    messages: list[dict] = [{"role": "system", "content": system_prompt}]
    messages.extend(conversation_history)
    messages.append({"role": "user", "content": caller_message})

    response = await client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=messages,
        max_tokens=150,
        temperature=0.7,
    )
    return (response.choices[0].message.content or "").strip()


async def detect_urgency(text: str) -> bool:
    text_lower = text.lower()
    return any(word in text_lower for word in URGENT_WORDS)


async def detect_booking_intent(text: str) -> bool:
    text_lower = text.lower()
    return any(word in text_lower for word in BOOKING_WORDS)
