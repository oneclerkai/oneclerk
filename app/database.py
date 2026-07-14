
    "ALTER TABLE conversation_turns ADD COLUMN IF NOT EXISTS agent_id VARCHAR",
    "ALTER TABLE conversation_turns ALTER COLUMN call_id DROP NOT NULL",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS twilio_number VARCHAR",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS telnyx_phone VARCHAR",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS telnyx_phone_sid VARCHAR",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS forwarding_number VARCHAR",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS google_refresh_token_encrypted TEXT",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS google_calendar_id VARCHAR DEFAULT 'primary'",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS timezone VARCHAR DEFAULT 'Asia/Kolkata'",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'draft'",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS voice_id VARCHAR DEFAULT 'Polly.Aditi'",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS language VARCHAR DEFAULT 'en-IN'",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS calls_this_month INTEGER DEFAULT 0 NOT NULL",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS total_calls INTEGER DEFAULT 0 NOT NULL",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS escalation_phone VARCHAR",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS created_at TIMESTAMP",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_sid VARCHAR",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS telnyx_call_sid VARCHAR",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS caller_number VARCHAR",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS duration_seconds INTEGER DEFAULT 0",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS conversation JSONB DEFAULT '[]'::jsonb",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'in_progress'",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN DEFAULT FALSE",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS escalated BOOLEAN DEFAULT FALSE NOT NULL",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS escalation_reason TEXT",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS booking_made BOOLEAN DEFAULT FALSE",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS appointment_booked BOOLEAN DEFAULT FALSE NOT NULL",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS booking_details TEXT",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS summary TEXT",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS started_at TIMESTAMP",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS created_at TIMESTAMP",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS rollover_minutes INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS rollover_expires_at TIMESTAMP",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS usage_alert_80_sent BOOLEAN DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS usage_alert_100_sent BOOLEAN DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS minutes_used_this_month INTEGER DEFAULT 0",
)


async def init_models() -> None:
    """Create tables on startup and run lightweight ALTER TABLE migrations."""
    _init_engine()
    if engine is None:
        return
    from app import models
    from sqlalchemy import text

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for stmt in _LIGHTWEIGHT_MIGRATIONS:
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    _init_engine()
    if AsyncSessionLocal is None:
        raise HTTPException(
            status_code=503,
            detail="Database is not configured. Set DATABASE_URL in the backend environment.",
        )
    async with AsyncSessionLocal() as session:
        yield session
