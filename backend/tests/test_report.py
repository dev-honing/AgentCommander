"""report() 테스트 — 상태 변화가 메모리·DB·화면에 한 번에 반영되는지.

목업 루프와 Phase 6의 LangGraph 노드가 공유하는 유일한 저장 경로라,
여기가 어긋나면 두 구현 모두 깨진다.
"""

from datetime import UTC, datetime

import pytest

import db
import orchestrator
from models import STATE_ZONES, AgentState, SubAgent
from tests.conftest import requires_db

pytestmark = requires_db


@pytest.fixture
async def pool():
    """report()는 DB 풀을 쓰므로 직접 열고 닫는다."""
    await db.init_pool()
    yield
    await db.close_pool()


async def _seed(agent_id: str = "agent-report") -> SubAgent:
    agent = SubAgent(
        agent_id=agent_id,
        name="Reporter",
        role="coder",
        state=AgentState.IDLE,
        position=STATE_ZONES[AgentState.IDLE],
        updated_at=datetime.now(UTC),
    )
    orchestrator.AGENTS[agent_id] = agent
    return agent


async def test_report_syncs_position_with_state(pool):
    """상태를 바꾸고 report()를 부르면 좌표가 그 상태의 존으로 맞춰진다.

    호출부가 좌표를 잊어도 어긋나지 않게 하려고 report()가 책임진다.
    """
    agent = await _seed()

    for state in AgentState:
        agent.state = state
        agent.position = (99.0, 99.0, 99.0)  # 일부러 엉뚱한 값
        await orchestrator.report(agent)
        assert agent.position == STATE_ZONES[state]


async def test_report_persists_and_updates_memory(pool):
    agent = await _seed("agent-report-2")
    agent.state = AgentState.RUNNING
    agent.message = "테스트 중"
    agent.progress = 0.42

    await orchestrator.report(agent)

    stored = await db.fetch_agent("agent-report-2")
    assert stored is not None
    assert stored.state is AgentState.RUNNING
    assert stored.message == "테스트 중"
    assert stored.position == STATE_ZONES[AgentState.RUNNING]

    assert orchestrator.AGENTS["agent-report-2"].progress == pytest.approx(0.42)


async def test_report_appends_history(pool):
    agent = await _seed("agent-report-3")

    before = await db.count_agent_logs("agent-report-3")
    for state in (AgentState.RUNNING, AgentState.WAITING, AgentState.DONE):
        agent.state = state
        await orchestrator.report(agent)
    after = await db.count_agent_logs("agent-report-3")

    assert after - before == 3


async def test_report_stamps_updated_at(pool):
    agent = await _seed("agent-report-4")
    agent.updated_at = None
    await orchestrator.report(agent)
    assert agent.updated_at is not None
