"""에이전트 상태 생성기 (명세 6.2 / 11.2절).

Phase 0~5는 목업 루프가 상태를 흔들어 파이프라인 전체
(상태 생성 → WebSocket → 프론트 반영 → 클릭 상호작용)를 검증한다.
Phase 6에서 이 파일의 내용만 LangGraph로 교체된다.

⚠️ 교체 시 바뀌는 것은 이 모듈뿐이어야 한다. WebSocket 메시지 스키마
   (models.py / protocol.ts)와 프론트엔드는 그대로 유지되어야 한다 — 2.2절.
   이 경계가 무너지면 프레임워크 결정 시점에 프론트까지 재작업하게 된다.

⚠️ Phase 0은 인메모리다. 영속성은 Phase 1에서 db.upsert_agent()를 붙인다.
   붙이는 지점은 _apply_transition() 한 곳뿐이 되도록 설계했다.
"""

import asyncio
import random
from datetime import UTC, datetime

from config import get_settings
from hub import hub
from models import STATE_ZONES, AgentState, AgentUpdateMessage, SubAgent

TICK_SECONDS = 2.0

# Phase 0 목업 시드. Phase 1부터는 roles/agents 테이블에서 읽어 온다.
# MOCK_AGENT_COUNT가 이 목록보다 크면 역할을 순환하며 이름에 번호를 붙인다.
_SEED = [
    ("Researcher", "researcher"),
    ("Coder", "coder"),
    ("Reviewer", "reviewer"),
]

AGENTS: dict[str, SubAgent] = {}

# 역할별 작업 문구. 대화풍선(5.2절)과 상태 메시지에 쓴다.
_ROLE_TASKS = {
    "researcher": ["웹 검색 중...", "문서 3건 수집", "출처 교차 확인 중"],
    "coder": ["모듈 작성 중...", "테스트 실행", "리팩터링 적용 중"],
    "reviewer": ["diff 검토 중...", "스타일 규칙 확인", "코멘트 정리 중"],
}


def reset_agents(count: int | None = None) -> None:
    """시드 상태로 되돌린다. 테스트와 기동 시점에 쓴다.

    count를 20으로 주면 렌더링 성능 측정용 부하를 만들 수 있다 (10.1절).
    기본값은 설정의 MOCK_AGENT_COUNT다.
    """
    if count is None:
        count = get_settings().mock_agent_count

    AGENTS.clear()
    for i in range(count):
        base_name, role = _SEED[i % len(_SEED)]
        # 시드보다 많이 만들 때만 이름에 번호를 붙여 구분한다
        name = base_name if i < len(_SEED) else f"{base_name}-{i // len(_SEED) + 1}"
        agent_id = f"agent-{i + 1:03d}"
        AGENTS[agent_id] = SubAgent(
            agent_id=agent_id,
            name=name,
            role=role,
            state=AgentState.IDLE,
            position=STATE_ZONES[AgentState.IDLE],
            updated_at=datetime.now(UTC),
        )


def next_state(current: AgentState, retry_count: int) -> AgentState:
    """다음 상태를 고른다.

    명세 6.2절 샘플은 random.choice로 아무 상태나 뽑지만, 그러면 재시도가
    누적되다 error로 떨어지는 흐름(11.2절)을 검증할 수 없다. 재시도 소진이
    실제로 일어나도록 최소한의 전이 규칙을 둔다.

    RETRYING에서 재시도 한도를 넘기면 반드시 ERROR로 간다 — ERROR는
    "최대 재시도 소진 후 최종 실패"라는 3.1절 정의를 지키기 위함이다.
    """
    max_retry = get_settings().max_retry_count

    match current:
        case AgentState.IDLE:
            return AgentState.RUNNING
        case AgentState.RUNNING:
            return random.choice(
                [AgentState.RUNNING, AgentState.WAITING, AgentState.RETRYING, AgentState.DONE]
            )
        case AgentState.WAITING:
            return random.choice([AgentState.RUNNING, AgentState.WAITING])
        case AgentState.RETRYING:
            # 한도를 소진했으면 선택의 여지 없이 최종 실패
            if retry_count >= max_retry:
                return AgentState.ERROR
            return random.choice([AgentState.RUNNING, AgentState.RETRYING])
        case AgentState.ERROR | AgentState.DONE:
            # 종료 상태는 짧게 머문 뒤 대기 구역으로 복귀한다 (5.1절)
            return AgentState.IDLE

    return AgentState.IDLE


def _compose_message(agent: SubAgent) -> str:
    if agent.state is AgentState.RETRYING:
        return f"{agent.retry_count}번째 재시도 중"
    if agent.state is AgentState.ERROR:
        return "재시도 소진 — 최종 실패"
    if agent.state is AgentState.DONE:
        return "작업 완료"
    if agent.state is AgentState.IDLE:
        return "대기 중"
    tasks = _ROLE_TASKS.get(agent.role, ["작업 중..."])
    return random.choice(tasks)


def apply_transition(agent: SubAgent) -> SubAgent:
    """에이전트 하나를 다음 상태로 옮기고 파생 필드를 갱신한다.

    Phase 1에서 영속성을 붙일 지점이 여기다 — 호출부는 그대로 두고
    이 함수 끝에 await upsert_agent(agent)만 추가하면 된다.
    """
    previous = agent.state
    agent.state = next_state(previous, agent.retry_count)

    # 재시도 횟수는 RETRYING에 머무는 동안만 누적되고, 벗어나면 초기화된다.
    if agent.state is AgentState.RETRYING:
        agent.retry_count += 1
    elif agent.state is not AgentState.ERROR:
        agent.retry_count = 0

    if agent.state is AgentState.DONE:
        agent.progress = 1.0
    elif agent.state is AgentState.IDLE:
        agent.progress = 0.0
    elif agent.state is AgentState.RUNNING:
        agent.progress = min(1.0, round(agent.progress + random.uniform(0.1, 0.3), 2))

    # 서버는 목표 좌표만 지정하고, 실제 이동 보간은 프론트가 처리한다 (5.1절)
    agent.position = STATE_ZONES[agent.state]
    agent.message = _compose_message(agent)
    agent.updated_at = datetime.now(UTC)
    return agent


async def mock_state_loop() -> None:
    """2초마다 임의 에이전트를 한 칸 전이시키고 변경분을 브로드캐스트한다.

    전체 스냅샷이 아니라 변경된 에이전트 하나만 보낸다 — 에이전트 수가 늘어도
    트래픽이 선형으로 커지지 않게 하려는 것이 4장의 설계 의도다.
    """
    while True:
        agent = random.choice(list(AGENTS.values()))
        apply_transition(agent)
        # TODO(Phase 1): await upsert_agent(agent) — 스냅샷과 이력을 함께 기록
        await hub.broadcast(AgentUpdateMessage(payload=agent).model_dump(mode="json"))
        await asyncio.sleep(TICK_SECONDS)


# TODO(Phase 6): LangGraph 연동
#   서브에이전트 1개 = LangGraph 그래프 1개(독립 실행) — 10.5절
#
#   from langgraph.graph import StateGraph
#   from langgraph.pregel import RetryPolicy
#
#   retry_policy = RetryPolicy(
#       max_attempts=settings.max_retry_count,             # 3
#       initial_interval=settings.retry_initial_interval,  # 1.0
#       backoff_factor=settings.retry_backoff_factor,      # 2.0 → 1s, 2s, 4s
#   )
#   graph.add_node("call_llm", call_llm_node, retry=retry_policy)
#
#   재시도 시 RETRYING + retry_count를 브로드캐스트하고, 소진되면 ERROR로
#   최종 전이한다. 위 next_state()가 이미 그 계약을 지키고 있으므로
#   교체 시 프론트 쪽 기대는 바뀌지 않는다 (11.2절).
