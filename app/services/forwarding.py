from __future__ import annotations


def get_forwarding_instructions(telnyx_number: str, carrier: str = "generic") -> dict:
    clean_number = telnyx_number.replace("+", "").replace("-", "").replace(" ", "")
    return {
        "telnyx_number": telnyx_number,
        "method": "conditional",
        "what_this_means": "Your phone rings first. OneClerk only answers if you miss the call.",
        "activate_codes": {
            "universal": f"*71{clean_number}",
            "description": "Dial this from your business phone to activate",
        },
        "deactivate_code": "#71",
        "test_instruction": "After activating, call your number from another phone. Don't answer. OneClerk should pick up after 3-4 rings.",
        "carrier_instructions": {
            "iPhone": "Settings -> Phone -> Call Forwarding (OR dial the code above)",
            "Android": "Phone app -> Settings -> Calls -> Additional settings -> Call forwarding",
            "Airtel India": f"Dial 67{clean_number} from your Airtel number",
            "Jio India": f"Dial *401*{clean_number}# from your Jio number",
            "Vi India": f"Dial *404*{clean_number}# from your Vi number",
            "BSNL India": f"Dial *61*{clean_number}# from your BSNL number",
            "Landline": "Contact your telecom provider to set up conditional call forwarding",
        },
        "carrier": carrier,
    }
