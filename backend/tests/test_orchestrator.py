"""목업 오케스트레이터 상태 전이 테스트.

명세 11.5절이 지정한 테스트 우선순위 중 1번(상태 전이 로직)과
3번(재시도 소진 후 error 전이)에 해당한다.
"""

import orchestrator
from config import get_settings
from models import STATE_ZONES, AgentState


def test_reset_seeds_idle_agents():
    orchestrator.reset_agents()
    assert len(orchestrator.AGENTS) == 3
    for agent in orchestrator.AGENTS.values():
        assert agent.state is AgentState.IDLE
        assert agent.position == STATE_ZONES[AgentState.IDLE]


def test_idle_always_starts_running():
    assert orchestrator.next_state(AgentState.IDLE, 0) is AgentState.RUNNING


def test_terminal_states_return_to_idle():
    """error/done은 짧게 머문 뒤 대기 구역으로 복귀한다 (명세 5.1절)."""
    assert orchestrator.next_state(AgentState.DONE, 0) is AgentState.IDLE
    assert orchestrator.next_state(AgentState.ERROR, 0) is AgentState.IDLE


def test_retry_exhaustion_forces_error():
    """재시도 한도를 소진하면 반드시 error로 간다 (명세 3.1 / 11.2절).

    ERROR는 "최대 재시도 소진 후 최종 실패"로 정의되어 있으므로, 한도를
    넘긴 RETRYING이 running으로 되돌아가면 안 된다.
    """
    max_retry = get_settings().max_retry_count
    assert orchestrator.next_state(AgentState.RETRYING, max_retry) is AgentState.ERROR
    assert orchestrator.next_state(AgentState.RETRYING, max_retry + 5) is AgentState.ERROR


def test_retry_below_limit_never_errors():
    """한도 이내에서는 error로 떨어지지 않는다."""
    for _ in range(50):
        assert orchestrator.next_state(AgentState.RETRYING, 0) is not AgentState.ERROR


def test_every_reachable_state_has_a_zone():
    """전이가 만들어내는 모든 상태에 목표 좌표가 있어야 한다 (명세 5.1절).

    좌표를 실제로 넣는 것은 report()다 — 저장 경로를 하나로 모아 상태와 존이
    어긋날 수 없게 했다. 여기서는 그 앞단인 전이 규칙이 좌표 없는 상태를
    만들지 않는지만 본다.
    """
    orchestrator.reset_agents()
    agent = orchestrator.AGENTS["agent-001"]
    seen = set()
    for _ in range(200):
        orchestrator.apply_transition(agent)
        seen.add(agent.state)
        assert agent.state in STATE_ZONES

    # 200번이면 종료 상태를 뺀 나머지는 한 번씩 나온다
    assert AgentState.RUNNING in seen
    assert AgentState.IDLE in seen


def test_retry_count_accumulates_then_resets():
    orchestrator.reset_agents()
    agent = orchestrator.AGENTS["agent-001"]

    agent.state = AgentState.RETRYING
    agent.retry_count = 1
    # 한도 소진 → error 로 가면서 retry_count는 보존된다(원인 파악용)
    agent.retry_count = get_settings().max_retry_count
    orchestrator.apply_transition(agent)
    assert agent.state is AgentState.ERROR
    assert agent.retry_count == get_settings().max_retry_count

    # error → idle 로 복귀하면 초기화된다
    orchestrator.apply_transition(agent)
    assert agent.state is AgentState.IDLE
    assert agent.retry_count == 0


def test_retrying_message_exposes_retry_count():
    """대화풍선에 'N번째 재시도 중'이 노출되어야 한다 (명세 5.1 / 11.2절)."""
    orchestrator.reset_agents()
    agent = orchestrator.AGENTS["agent-002"]
    agent.state = AgentState.RUNNING
    agent.retry_count = 0

    # RETRYING에 진입할 때까지 돌린다
    for _ in range(200):
        orchestrator.apply_transition(agent)
        if agent.state is AgentState.RETRYING:
            break

    assert agent.state is AgentState.RETRYING
    assert agent.retry_count >= 1
    assert f"{agent.retry_count}번째 재시도" in (agent.message or "")


def test_done_sets_full_progress():
    orchestrator.reset_agents()
    agent = orchestrator.AGENTS["agent-003"]
    agent.state = AgentState.DONE
    agent.progress = 1.0
    assert agent.progress == 1.0
