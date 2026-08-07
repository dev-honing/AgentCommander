"""리서치 실행 REST API (Phase 6).

질문 하나를 넣으면 에이전트 여러 개가 갈라져 나와 조사·검증·정리를 한다.
실행 자체는 비동기라 즉시 run_id 만 돌려주고, 진행 상황은 WebSocket 으로
흘러간다 — 설정성 작업은 REST, 실시간 상태는 WebSocket 이라는 9장 원칙 그대로다.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

import db
import orchestrator
import research
from auth import verify_api_key
from models import SubAgent

router = APIRouter(prefix="/api/runs", dependencies=[Depends(verify_api_key)])


class RunCreate(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    # 조사 담당 수. 비우면 설정값을 쓴다.
    researchers: int | None = Field(default=None, ge=1, le=5)


class RunCreated(BaseModel):
    run_id: str
    question: str
    agents: list[str]


@router.post("", status_code=202)
async def create_run(body: RunCreate) -> RunCreated:
    """리서치를 시작한다.

    202 를 쓰는 이유: 작업이 끝난 게 아니라 접수만 된 상태다. 결과는
    GET /api/runs/{run_id} 로 확인하거나 화면에서 지켜본다.
    """
    run_id = await research.run_research(body.question, body.researchers)
    agents = [a for a in orchestrator.AGENTS if a.startswith(f"{run_id}-")]
    return RunCreated(run_id=run_id, question=body.question, agents=sorted(agents))


@router.get("/{run_id}")
async def get_run(run_id: str) -> list[SubAgent]:
    """한 실행에 속한 에이전트들의 현재 상태.

    parent_id 로 묶여 있어 별도 테이블 없이도 조회된다.
    """
    agents = await db.fetch_agents()
    return [a for a in agents if a.parent_id == run_id]
