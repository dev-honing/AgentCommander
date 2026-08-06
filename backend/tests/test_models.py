"""상태 모델 및 존 매핑 테스트.

명세 11.5절이 지정한 테스트 우선순위 세 가지 중 첫 번째(상태 전이 로직)의
토대에 해당한다. 나머지 둘은 해당 기능 구현과 함께 추가한다.

  1. 상태 전이 로직 (AgentState 변화)          ← 이 파일
  2. REST API의 role 존재 검증 (404)           → Phase 5, test_routers_agents.py
  3. 재시도 소진 후 error 전이                 → Phase 6, test_orchestrator.py
"""

from models import STATE_ZONES, AgentState, SubAgent


def test_all_states_have_a_zone():
    """상태가 추가되면 존 좌표도 함께 정의되어야 한다 (명세 5.1절).

    이 테스트가 없으면 새 상태를 추가했을 때 프론트가 좌표를 못 받아
    캐릭터가 원점에 겹쳐 서는 형태로 조용히 깨진다.
    """
    for state in AgentState:
        assert state in STATE_ZONES, f"{state}에 대한 존 좌표가 정의되지 않았습니다"


def test_retrying_shares_running_zone():
    """retrying은 running과 같은 구역을 쓰고 애니메이션으로만 구분한다 (명세 5.1절)."""
    assert STATE_ZONES[AgentState.RETRYING] == STATE_ZONES[AgentState.RUNNING]


def test_error_and_done_have_distinct_zones():
    """최종 상태 둘은 서로도, 대기 구역과도 구분되어야 한다."""
    zones = {
        STATE_ZONES[AgentState.IDLE],
        STATE_ZONES[AgentState.ERROR],
        STATE_ZONES[AgentState.DONE],
    }
    assert len(zones) == 3


def test_agent_defaults():
    agent = SubAgent(agent_id="agent-001", name="Researcher", role="researcher")
    assert agent.state is AgentState.IDLE
    assert agent.retry_count == 0
    assert agent.progress == 0.0


def test_progress_is_bounded():
    """progress는 0.0~1.0 범위다 (명세 3.1절)."""
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        SubAgent(agent_id="a", name="n", role="r", progress=1.5)
