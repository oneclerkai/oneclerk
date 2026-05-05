from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery(
    "oneclerk",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.beat_schedule = {
    "daily-digest": {
        "task": "app.tasks.background.send_daily_digest",
        "schedule": crontab(hour=8, minute=0),
    },
    "reset-monthly-counts": {
        "task": "app.tasks.background.reset_monthly_call_counts",
        "schedule": crontab(day_of_month=1, hour=0, minute=0),
    },
    "cleanup-audio": {
        "task": "app.tasks.background.cleanup_audio_files",
        "schedule": 1800.0,
    },
}
