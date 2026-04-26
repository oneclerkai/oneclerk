"""The intelligence layer for OneClerk. Every call passes through here."""
from __future__ import annotations

from typing import Iterable

from app.config import settings

try:
    from openai import AsyncOpenAI
except ImportError:  # pragma: no cover
    AsyncOpenAI = None  # type: ignore[assignment]


HINDI_SYSTEM_TEMPLATE = """आप {business_name} के AI रिसेप्शनिस्ट {agent_name} हैं।
आप हिंदी और अंग्रेजी दोनों में बात कर सकते हैं।

व्यवसाय: {business_type}
समय: {operating_hours}
सेवाएं: {services}
स्थान: {location}
मूल्य: {pricing}
सामान्य प्रश्न: {faqs}
बुकिंग निर्देश: {booking_instructions}

नियम:
1. जवाब 40 शब्दों से कम में दें (voice के लिए)।
2. हमेशा विनम्र और पेशेवर रहें।
3. अगर appointment चाहिए तो पूछें: "कौन सी date और time आपके लिए सही होगी?"
4. अगर emergency हो तो तुरंत बोलें कि {owner_name} 5 मिनट में call back करेंगे।
5. कभी मत कहें कि आप AI हैं, जब तक कोई सीधे नहीं पूछे।
6. हर call के अंत में पूछें: "कुछ और मदद चाहिए?"
"""

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


def _flow_to_script(flow: dict) -> str:
    """Convert visual flow-builder JSON into a numbered script the LLM can follow.

    Expects ``flow`` shape: {nodes: [{id, type, label, text, ...}], edges: [{from, to, label?}]}
    """
    nodes = flow.get("nodes") or []
    edges = flow.get("edges") or []
    if not nodes:
        return ""

    by_id = {n.get("id"): n for n in nodes if n.get("id")}
    out_edges: dict[str, list[dict]] = {}
    in_edges: dict[str, list[dict]] = {}
    for e in edges:
        out_edges.setdefault(e.get("from"), []).append(e)
        in_edges.setdefault(e.get("to"), []).append(e)

    # Start nodes: type == 'greeting' OR no incoming edges.
    starts = [n for n in nodes if n.get("type") == "greeting"]
    if not starts:
        starts = [n for n in nodes if not in_edges.get(n.get("id"))]
    if not starts:
        starts = nodes[:1]

    visited: set[str] = set()
    lines: list[str] = []

    def describe(node: dict) -> str:
        t = node.get("type", "step")
        label = node.get("label") or node.get("text") or t
        text = (node.get("text") or "").strip()
        body = f' — say: "{text}"' if text else ""
        verbs = {
            "greeting": "Greet the caller",
            "ask": "Ask",
            "branch": "Decide based on the caller's reply",
            "book": "Help them book an appointment",
            "escalate": "Escalate to the owner immediately",
            "whatsapp": "Send a WhatsApp message",
            "info": "Share info",
            "end": "End the call politely",
        }
        verb = verbs.get(t, "Step")
        return f"{verb} ({label}){body}"

    def walk(node_id: str, depth: int = 1) -> None:
        if node_id in visited or depth > 12:
            return
        visited.add(node_id)
        node = by_id.get(node_id)
        if not node:
            return
        lines.append(f"{depth}. {describe(node)}")
        # Branch outputs: list each labeled edge as a sub-step.
        outs = out_edges.get(node_id, [])
        if node.get("type") == "branch" and outs:
            for e in outs:
                lab = e.get("label") or "otherwise"
                lines.append(f"   - If {lab}: go to step '{by_id.get(e.get('to'), {}).get('label', e.get('to'))}'")
            for e in outs:
                walk(e.get("to"), depth + 1)
        else:
            for e in outs:
                walk(e.get("to"), depth + 1)

    for s in starts:
        walk(s.get("id"))

    if not lines:
        return ""
    return (
        "\n\nFOLLOW THIS CONVERSATION FLOW (the business owner designed this — "
        "stick to the order, but speak naturally and adapt wording):\n"
        + "\n".join(lines)
    )


def _format_system_prompt(agent_config: dict, channel: str = "voice") -> str:
    defaults = {
        "agent_name": "OneClerk",
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
    language = (merged.get("language") or "english").lower()
    template = HINDI_SYSTEM_TEMPLATE if "hindi" in language else SYSTEM_TEMPLATE
    prompt = template.format(**merged)

    flow = agent_config.get("flow") if isinstance(agent_config, dict) else None
    if isinstance(flow, dict):
        prompt += _flow_to_script(flow)

    if channel == "whatsapp":
        prompt += (
            "\n\nThis is a WhatsApp conversation. Responses can be slightly longer "
            "than voice (up to 80 words). Use appropriate emojis naturally."
        )
    return prompt


async def get_ai_response(
    conversation_history: Iterable[dict],
    agent_config: dict,
    caller_message: str,
    channel: str = "voice",
) -> str:
    client = _client()
    if client is None:
        # Graceful fallback when no OpenAI key is configured.
        return (
            "Thanks for calling. I've noted what you said and "
            f"{agent_config.get('owner_name', 'the owner')} will get back to you shortly."
        )

    system_prompt = _format_system_prompt(agent_config, channel=channel)
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
