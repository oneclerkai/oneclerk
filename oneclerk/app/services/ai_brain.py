import json
import re
from typing import List, Dict, Optional
import openai
from redis import Redis
from app.config import settings

redis_client = Redis.from_url(settings.REDIS_URL, decode_responses=True)

def detect_language(text: str) -> str:
    """Detect language based on character sets."""
    if re.search(r'[\u0900-\u097F]', text):
        return "hindi"
    if re.search(r'[\u0B80-\u0BFF]', text):
        return "tamil"
    if re.search(r'[\u0C00-\u0C7F]', text):
        return "telugu"
    if re.search(r'[\u0D00-\u0D7F]', text):
        return "malayalam"
    if re.search(r'[\u0600-\u06FF]', text):
        return "arabic"
    if re.search(r'[\u0980-\u09FF]', text):
        return "bengali"
    if re.search(r'[\u0C80-\u0CFF]', text):
        return "kannada"
    return "english"

PROMPTS = {
    "hindi": "आप एक सहायक रिसेप्शनिस्ट हैं। संक्षेप में उत्तर दें (40 शब्द)।",
    "tamil": "நீங்கள் ஒரு பயனுள்ள வரவேற்பாளர். சுருக்கமாக பதிலளிக்கவும் (40 வார்த்தைகள்).",
    "telugu": "మీరు సహాయక రిసెప్షనిస్ట్. సంక్షిప్తంగా సమాధానం ఇవ్వండి (40 పదాలు).",
    "malayalam": "നിങ്ങൾ ഒരു സഹായിയായ റിസപ്ഷനിസ്റ്റാണ്. ചുരുക്കത്തിൽ മറുപടി നൽകുക (40 വാക്കുകൾ).",
    "marathi": "तुम्ही एक मदतनीस रिसेप्शनिस्ट आहात. थोडक्यात उत्तरे द्या (40 शब्द).",
    "english": "You are a helpful AI receptionist. Keep responses under 40 words."
}

async def get_ai_response(
    text: str, 
    history: List[Dict[str, str]], 
    business_context: Dict, 
    agent_name: str = "OneClerk"
) -> Dict:
    """Get AI response from OpenAI with structured output."""
    lang = detect_language(text)
    system_prompt = business_context.get("system_prompt") or PROMPTS.get(lang, PROMPTS["english"])
    
    # Check FAQ cache
    cache_key = f"faq:{hashlib.md5(text.lower().strip().encode()).hexdigest()}"
    cached_response = redis_client.get(cache_key)
    if cached_response:
        return json.loads(cached_response)

    # Prepare messages (max 6 turns)
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history[-6:])
    messages.append({"role": "user", "content": text})

    client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    
    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=messages,
            max_tokens=100,
            response_format={"type": "json_object"}
        )
        
        result = json.loads(response.choices[0].message.content)
        # Ensure detected_language is in result
        result["detected_language"] = lang
        
        # Cache if it looks like a general question
        if not result.get("booking_detected") and not result.get("escalate"):
            redis_client.setex(cache_key, 3600, json.dumps(result))
            
        return result
    except Exception as e:
        return {
            "response": "I'm sorry, I'm having trouble processing that. Let me connect you with someone.",
            "escalate": True,
            "escalation_reason": str(e),
            "detected_language": lang
        }

import hashlib
