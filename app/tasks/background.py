from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
import os
import time

from sqlalchemy import func, select, text

from app.database import get_sessionmaker
from app.models import Agent, Call, User
from app.services.ai_brain import generate_call_summary
from app.services.synthesis import AUDIO_DIR
from app.services.whatsapp import send_call_summary_to_owner, send_daily_digest as send_daily_digest_message
from app.tasks.celery_app import celery_app


async def _get_call(db, call_id: str) -> Call | None:
    return (await db.execute(select(Call).where(Call.id == call_id))).scalar_one_or_none()


async def _get_agent(db, agent_id: str) -> Agent | None:
    return (await db.execute(select(Agent).where(Agent.id == agent_id))).scalar_one_or_none()


async def _get_user(db, user_id: str) -> User | None:
    return (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()


@celery_app.task(bind=True, max_retries=3)
def process_completed_call(self, call_id: str):
    async def run():
        sessionmaker = get_sessionmaker()
        if sessionmaker is None:
            return
        async with sessionmaker() as db:
            call = await _get_call(db, call_id)
            if call is None:
                return
            agent = await _get_agent(db, call.agent_id)
            user = await _get_user(db, call.user_id)
            if agent is None or user is None:
                return
            conversation = call.conversation or []
            if not conversation:
                return
            summary = await generate_call_summary(conversation, agent)
            call.summary = summary.get("summary")
            if summary.get("appointment_booked"):
                call.appointment_booked = True
            agent.calls_this_month += 1
            agent.total_calls += 1
            await db.commit()
            owner_whatsapp = agent.business_context.get("owner_whatsapp") or user.whatsapp_number or ""
            if owner_whatsapp:
                await send_call_summary_to_owner(
                    owner_whatsapp,
                    call.caller_number or "",
                    summary.get("summary", ""),
                    call.duration_seconds,
                    call.escalated,
                    call.appointment_booked,
                    agent.name,
                )

    asyncio.run(run())


@celery_app.task
def send_daily_digest():
    async def run():
        sessionmaker = get_sessionmaker()
        if sessionmaker is None:
            return
        async with sessionmaker() as db:
            users = (await db.execute(select(User))).scalars().all()
            yesterday = datetime.utcnow() - timedelta(days=1)
            for user in users:
                if not user.whatsapp_number:
                    continue
                calls_yesterday = (
                    await db.execute(select(func.count(Call.id)).where(Call.user_id == user.id, Call.created_at >= yesterday))
                ).scalar_one()
                bookings = (
                    await db.execute(select(func.count(Call.id)).where(Call.user_id == user.id, Call.created_at >= yesterday, Call.appointment_booked.is_(True)))
                ).scalar_one()
                escalations = (
                    await db.execute(select(func.count(Call.id)).where(Call.user_id == user.id, Call.created_at >= yesterday, Call.escalated.is_(True)))
                ).scalar_one()
                await send_daily_digest_message(
                    user.whatsapp_number,
                    (user.business_profile or {}).get("business_name", user.name or "OneClerk"),
                    int(calls_yesterday),
                    int(bookings),
                    int(escalations),
                )

    asyncio.run(run())


@celery_app.task
def reset_monthly_call_counts():
    async def run():
        sessionmaker = get_sessionmaker()
        if sessionmaker is None:
            return
        async with sessionmaker() as db:
            await db.execute(text("UPDATE agents SET calls_this_month = 0"))
            await db.commit()

    asyncio.run(run())


@celery_app.task
def cleanup_audio_files():
    audio_dir = str(AUDIO_DIR)
    if not os.path.exists(audio_dir):
        return
    now = time.time()
    deleted = 0
    for filename in os.listdir(audio_dir):
        filepath = os.path.join(audio_dir, filename)
        if os.path.isfile(filepath) and os.path.getmtime(filepath) < now - 1800:
            os.remove(filepath)
            deleted += 1
    print(f"Cleaned up {deleted} audio files")
