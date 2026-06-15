from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

from app.config import settings

_broker = settings.REDIS_URL or "memory://"
_backend = settings.REDIS_URL or "cache+memory://"

celery_app = Celery(
    "oneclerk",
    broker=_broker,
    backend=_backend,
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
    "calculate-monthly-rollover": {
        "task": "app.tasks.background.calculate_monthly_rollover",
        # Run at the beginning of the first day of each month to evaluate the
        # previous month's usage window and preserve all final calendar days.
        "schedule": crontab(day_of_month="1", hour=0, minute=0),
    },
    "cleanup-audio": {
        "task": "app.tasks.background.cleanup_audio_files",
        "schedule": 1800.0,
    },
}
