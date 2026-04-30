from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from app.database import get_db
from app.models.agent import Agent, AgentStatus
from app.schemas.agent import AgentCreate, AgentUpdate, AgentOut
from app.dependencies import get_current_user
from typing import List
import uuid

router = APIRouter(prefix="/api/agents", tags=["agents"])

@router.get("/", response_model=List[AgentOut])
async def list_agents(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = select(Agent).where(Agent.user_id == current_user["sub"])
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("/", response_model=AgentOut)
async def create_agent(agent_in: AgentCreate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    new_agent = Agent(
        **agent_in.model_dump(),
        user_id=current_user["sub"]
    )
    db.add(new_agent)
    await db.commit()
    await db.refresh(new_agent)
    return new_agent

@router.get("/{agent_id}", response_model=AgentOut)
async def get_agent(agent_id: uuid.UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = select(Agent).where(Agent.id == agent_id, Agent.user_id == current_user["sub"])
    result = await db.execute(stmt)
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent

@router.patch("/{agent_id}", response_model=AgentOut)
async def update_agent(agent_id: uuid.UUID, agent_in: AgentUpdate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = select(Agent).where(Agent.id == agent_id, Agent.user_id == current_user["sub"])
    result = await db.execute(stmt)
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    update_data = agent_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(agent, key, value)
    
    await db.commit()
    await db.refresh(agent)
    return agent

@router.delete("/{agent_id}")
async def delete_agent(agent_id: uuid.UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = delete(Agent).where(Agent.id == agent_id, Agent.user_id == current_user["sub"])
    await db.execute(stmt)
    await db.commit()
    return {"status": "deleted"}

@router.post("/{agent_id}/activate")
async def activate_agent(agent_id: uuid.UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = update(Agent).where(Agent.id == agent_id, Agent.user_id == current_user["sub"]).values(status=AgentStatus.active)
    await db.execute(stmt)
    await db.commit()
    return {"status": "activated"}

@router.post("/{agent_id}/deactivate")
async def deactivate_agent(agent_id: uuid.UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = update(Agent).where(Agent.id == agent_id, Agent.user_id == current_user["sub"]).values(status=AgentStatus.inactive)
    await db.execute(stmt)
    await db.commit()
    return {"status": "deactivated"}

@router.post("/{agent_id}/get-number")
async def get_agent_number(agent_id: uuid.UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # In a real app, provision a number via Telnyx
    return {"phone_number": "+1234567890"}

@router.get("/{agent_id}/setup-instructions")
async def get_setup_instructions(agent_id: uuid.UUID):
    return {"instructions": "Forward your calls to +1234567890"}

@router.post("/{agent_id}/test")
async def test_agent(agent_id: uuid.UUID):
    return {"status": "test_call_initiated"}

@router.get("/{agent_id}/availability")
async def get_agent_availability(agent_id: uuid.UUID, date: str):
    return {"available_slots": ["09:00", "10:00", "11:00"]}
