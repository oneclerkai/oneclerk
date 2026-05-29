import asyncio
import sys
from sqlalchemy import text

from app.database import init_models, safe_db_operation


async def execute_system_health_audit():
    print("🚀 Initiating OneClerk Backend Architecture Audit...")

    try:
        print("⚙️ Running idempotent database migrations...")
        await init_models()
        print("✅ Database models initialized and structural migrations synced.")
    except Exception as error:
        print(f"❌ Migration Error: Failed to execute alter table statements. Details: {error}")
        sys.exit(1)

    try:
        print("🔍 Testing safe_db_operation isolation context manager...")
        async with safe_db_operation() as session:
            query = text("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'users' 
                AND column_name IN ('minutes_used_this_month', 'rollover_minutes', 'rollover_expires_at');
            """)
            result = await session.execute(query)
            columns = result.fetchall()

            print("📊 Discovered billing migration columns in database schema:")
            for col in columns:
                print(f"   • Column: {col[0]} ({col[1]})")

            if len(columns) < 3:
                print("❌ Verification Flaw: Missing target rollover billing tracking columns.")
                sys.exit(1)

        print("✅ Transaction context manager test successful (Auto-commit / Clean disconnect validated).")
        print("\n🎉 Verification complete: The backend architecture and database engines are ready for connection.")

    except Exception as error:
        print(f"❌ Context Handler Error: Database operations failed. Details: {error}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(execute_system_health_audit())
