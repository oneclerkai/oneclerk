import asyncio
from app.tasks.celery_app import celery_app
from app.services import whatsapp, gmail_service
import logging

logger = logging.getLogger(__name__)

@celery_app.task(name="send_whatsapp_async")
def send_whatsapp_async(to, message):
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(whatsapp.send_whatsapp(to, message))

@celery_app.task(name="send_call_summary_async")
def send_call_summary_async(to, caller, summary, duration, booked, escalated, agent_name):
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(
        whatsapp.send_call_summary(to, caller, summary, duration, booked, escalated, agent_name)
    )

@celery_app.task(name="process_post_call")
def process_post_call(call_id):
    """Placeholder for post-call processing like generating detailed summaries."""
    logger.info(f"Processing post-call for {call_id}")
    return True
