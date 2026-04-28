"""Carrier-specific call-forwarding setup instructions.

OneClerk uses *conditional* call forwarding (*71) so the customer's own phone
rings first; OneClerk only takes over when they don't answer or are busy.
"""
from __future__ import annotations


def get_forwarding_instructions(twilio_number: str, carrier: str = "generic") -> dict:
    activate = f"*71{twilio_number}"
    deactivate = "#71"

    carrier_notes = {
        "iphone": "Settings → Phone → Call Forwarding gives you a visual setup. Toggle on and enter your OneClerk number.",
        "android": f"Dial {activate} from your business phone, or use Settings → Calls → Call Forwarding → Forward when busy / unanswered.",
        "airtel": f"Dial {activate} — you'll hear a confirmation tone.",
        "jio": f"Dial {activate} or open MyJio → Settings → Call Settings → Call Forwarding.",
        "bsnl": f"Dial {activate} from your BSNL number.",
        "vi": f"Dial {activate} or use the Vi app → Settings → Call Forwarding.",
        "generic": f"Dial {activate} from the phone you want to forward.",
    }

    return {
        "method": "conditional",
        "headline": "OneClerk only answers calls you miss — your phone rings first.",
        "activate_code": activate,
        "deactivate_code": deactivate,
        "test_instruction": "Call your business number from another phone and let it ring. After ~3 rings OneClerk should pick up.",
        "carrier": carrier,
        "carrier_notes": carrier_notes,
        "twilio_number": twilio_number,
    }
