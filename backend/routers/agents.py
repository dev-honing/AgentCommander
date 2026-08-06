"""에이전트 REST API (명세 9.2 / 9.3절).

WebSocket은 실시간 상태 스트리밍 전용이고, 설정성 작업(생성/삭제)은 여기로
분리한다. 명세 4.2절에도 create_agent / terminate_agent WebSocket 메시지가
있으나 REST를 정본으로 삼는다 — docs/SPEC-NOTES.md 6번 항목.

생성/삭제가 일어나면 그 결과를 hub.broadcast()로 알려 프론트가 별도 폴링
없이 반영하게 한다.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query

import db
import orchestrator
from auth import verify_api_key
from hub import hub
from models import (
    STATE_ZONES,
    AgentCreate,
    AgentPatch,
    AgentRefPayload,
    AgentRemovedMessage,
    AgentState,
    AgentUpdateMessage,
    SubAgent,
)

router = APIRouter(prefix="/api/agents", dependencies=[Depends(verify_api_key)])


@router.get("")
async def list_agents(state: AgentState | None = None) -> list[SubAgent]:
    agents = await db.fetch_agents()
    if state is not None:
        agents = [a for a in agents if a.state is state]
    return agents


@router.get("/{agent_id}")
async def get_agent(agent_id: str) -> SubAgent:
    agent = await db.fetch_agent(agent_id)
    if agent is None:
        raise HTTPException(404, f"agent '{agent_id}' not found")
    return agent


@router.post("", status_code=201)
async def create_agent(body: AgentCreate) -> SubAgent:
    """에이전트 생성.

    role 존재 여부를 앱 레벨에서 먼저 확인해 404로 명확히 응답한다.
    FK 제약은 최후 방어선이지 사용자에게 보여줄 에러가 아니다 (9.3절).

    ⚠️ agent_id를 이름 기반으로 만들면 동일 이름 재생성 시 충돌한다.
       프로토타입 단계에선 단순함을 택하되 Phase 6 이후 UUID로 전환한다
       (9장 주의사항). 지금은 충돌을 409로 명확히 알린다.
    """
    if not await db.role_exists(body.role):
        raise HTTPException(404, f"role '{body.role}' not found")

    agent_id = f"agent-{body.name.lower().replace(' ', '-')}"
    if await db.fetch_agent(agent_id) is not None:
        raise HTTPException(409, f"'{body.name}' 이름의 에이전트가 이미 있습니다")

    agent = SubAgent(
        agent_id=agent_id,
        name=body.name,
        role=body.role,
        state=AgentState.IDLE,
        position=STATE_ZONES[AgentState.IDLE],
        message="대기 중",
        updated_at=datetime.now(UTC),
    )
    await db.insert_agent(agent)

    # 메모리 상태와 3D 씬에 즉시 반영한다
    orchestrator.AGENTS[agent_id] = agent
    await hub.broadcast(AgentUpdateMessage(payload=agent).model_dump(mode="json"))
    return agent


@router.patch("/{agent_id}")
async def patch_agent(agent_id: str, body: AgentPatch) -> SubAgent:
    agent = await db.fetch_agent(agent_id)
    if agent is None:
        raise HTTPException(404, f"agent '{agent_id}' not found")

    if body.name is not None:
        agent.name = body.name
    agent.updated_at = datetime.now(UTC)
    await db.upsert_agent(agent)

    orchestrator.AGENTS[agent_id] = agent
    await hub.broadcast(AgentUpdateMessage(payload=agent).model_dump(mode="json"))
    return agent


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(agent_id: str) -> None:
    """에이전트 종료/삭제.

    이력(agent_logs)은 지우지 않는다 — 삭제된 에이전트도 나중에 복기할 수
    있어야 하기 때문이다.
    """
    if not await db.delete_agent(agent_id):
        raise HTTPException(404, f"agent '{agent_id}' not found")

    orchestrator.AGENTS.pop(agent_id, None)
    await hub.broadcast(
        AgentRemovedMessage(payload=AgentRefPayload(agent_id=agent_id)).model_dump(mode="json")
    )


@router.get("/{agent_id}/logs")
async def get_agent_logs(
    agent_id: str,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> dict:
    """상태 이력 조회 — 복기용 (명세 9.2절).

    total을 함께 돌려줘야 프론트가 "더 보기"를 언제 멈출지 알 수 있다.
    """
    logs = await db.fetch_agent_logs(agent_id, limit=limit, offset=offset)
    total = await db.count_agent_logs(agent_id)
    return {"total": total, "limit": limit, "offset": offset, "items": logs}
