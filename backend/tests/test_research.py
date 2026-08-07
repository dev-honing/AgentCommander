"""리서치 파이프라인 테스트 (Phase 6).

명세 11.5절의 우선순위 3번(재시도 소진 후 error 전이)을 목업이 아니라
실제 LangGraph 경로에서 검증한다. 가짜 LLM 의 실패율을 0 또는 1로 고정해
무작위성을 없앤 상태로 본다.
"""

import pytest

import db
import orchestrator
import research
from config import get_settings
from models import STATE_ZONES, AgentState, SubAgent
from tests.conftest import requires_db

pytestmark = requires_db


@pytest.fixture
async def pool():
    await db.init_pool()
    yield
    await db.close_pool()


@pytest.fixture
def fast_llm(monkeypatch):
    """지연을 없애 테스트가 오래 걸리지 않게 한다."""
    settings = get_settings()
    monkeypatch.setattr(settings, "fake_llm_min_delay", 0.0)
    monkeypatch.setattr(settings, "fake_llm_max_delay", 0.0)
    monkeypatch.setattr(settings, "retry_initial_interval", 0.0)
    return settings


async def _agent(agent_id: str) -> SubAgent:
    agent = SubAgent(
        agent_id=agent_id,
        name="Probe",
        role="researcher",
        state=AgentState.IDLE,
        position=STATE_ZONES[AgentState.IDLE],
        parent_id="run-test",
    )
    orchestrator.AGENTS[agent_id] = agent
    await db.upsert_agent(agent)
    return agent


async def test_success_reaches_done(pool, fast_llm, monkeypatch):
    monkeypatch.setattr(fast_llm, "fake_llm_failure_rate", 0.0)
    agent = await _agent("run-test-ok")

    result = await research.run_agent(agent, "조사해줘")

    assert agent.state is AgentState.DONE
    assert agent.progress == 1.0
    assert result
    assert agent.result == result
    # 완료 상태의 존으로 좌표가 맞춰져야 한다
    assert agent.position == STATE_ZONES[AgentState.DONE]


async def test_retry_exhaustion_reaches_error(pool, fast_llm, monkeypatch):
    """모두 실패하면 재시도를 소진하고 error 로 끝나야 한다 (명세 3.1 / 11.2절)."""
    monkeypatch.setattr(fast_llm, "fake_llm_failure_rate", 1.0)
    agent = await _agent("run-test-fail")

    result = await research.run_agent(agent, "조사해줘")

    assert agent.state is AgentState.ERROR
    assert result == ""
    assert agent.retry_count == get_settings().max_retry_count
    assert agent.position == STATE_ZONES[AgentState.ERROR]


async def test_retrying_is_recorded_in_history(pool, fast_llm, monkeypatch):
    """재시도가 이력에 남아야 나중에 복기할 수 있다.

    RetryPolicy 는 재시도를 조용히 처리하므로, 노드가 직접 세어 보고하지
    않으면 화면에도 이력에도 아무것도 남지 않는다.
    """
    monkeypatch.setattr(fast_llm, "fake_llm_failure_rate", 1.0)
    agent = await _agent("run-test-retry")

    await research.run_agent(agent, "조사해줘")

    logs = await db.fetch_agent_logs("run-test-retry", limit=50)
    states = [lg.state for lg in logs]
    assert AgentState.RETRYING in states
    assert AgentState.ERROR in states

    retries = sorted({lg.retry_count for lg in logs if lg.state is AgentState.RETRYING})
    assert retries[0] >= 1


async def test_managed_agents_are_released(pool, fast_llm, monkeypatch):
    """그래프가 끝나면 목업 루프가 다시 건드릴 수 있게 풀어줘야 한다."""
    monkeypatch.setattr(fast_llm, "fake_llm_failure_rate", 0.0)
    agent = await _agent("run-test-managed")

    await research.run_agent(agent, "조사해줘")

    assert agent.agent_id not in orchestrator.MANAGED


def test_mock_loop_skips_run_agents():
    """실행에 속한 에이전트(parent_id 있음)는 목업 전이 대상에서 빠진다.

    빠지지 않으면 끝난 작업을 목업이 다시 흔들어, 화면이 거짓말을 한다.
    """
    orchestrator.reset_agents()
    managed = SubAgent(
        agent_id="run-x-researcher-1",
        name="R",
        role="researcher",
        state=AgentState.DONE,
        parent_id="run-x",
    )
    orchestrator.AGENTS[managed.agent_id] = managed

    free = [
        a
        for a in orchestrator.AGENTS.values()
        if a.agent_id not in orchestrator.MANAGED and a.parent_id is None
    ]
    assert managed not in free
    assert all(a.parent_id is None for a in free)
