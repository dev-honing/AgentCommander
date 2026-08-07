"""리서치 파이프라인 — LangGraph 기반 실제 오케스트레이션 (명세 Phase 6).

명세 10.5절이 정한 구조를 따른다: **서브에이전트 1개 = LangGraph 그래프 1개**.
각 에이전트가 자기 그래프를 독립적으로 돌리고, 상태는 orchestrator.report()로
보고한다. 목업과 같은 통로를 쓰므로 프론트엔드는 아무것도 바뀌지 않는다.

질문 하나가 들어오면 이렇게 갈라진다:

    질문
      ├─ researcher-1  ─┐
      ├─ researcher-2   │  각자 다른 각도로 조사 (동시 실행)
      ├─ researcher-3  ─┘
      ├─ reviewer         조사 완료를 기다렸다가 교차 검증  ← waiting
      └─ writer           검증 결과로 최종 정리            ← waiting

조사 담당들이 끝나야 검증이 시작되므로 waiting 상태가 실제로 발생한다.
의존 관계가 없으면 그 존이 영영 비어 있게 된다.

⚠️ 명세 11.2절은 RetryPolicy 를 langgraph.pregel 에서 가져오라고 적었지만
   현재 버전에서는 langgraph.types 로 옮겨졌다.
"""

import asyncio
import contextlib
from datetime import UTC, datetime
from typing import TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import RetryPolicy

import orchestrator
from config import get_settings
from llm.adapter import LLMError, get_llm_client
from models import STATE_ZONES, AgentState, SubAgent

# 조사 담당들이 맡을 관점. 질문 하나를 여러 각도로 쪼개 동시에 던진다.
RESEARCH_ANGLES = [
    "핵심 개념과 정의를 조사",
    "경쟁 제품과 대안을 조사",
    "실제 사용 사례와 후기를 조사",
    "한계와 알려진 문제를 조사",
    "최근 동향과 변화를 조사",
]


class AgentRunState(TypedDict):
    """그래프 하나가 들고 다니는 상태. 에이전트 하나의 작업 단위다."""

    agent_id: str
    task: str
    result: str


# 에이전트별 재시도 횟수.
#
# ⚠️ 그래프 상태(AgentRunState)에 담으면 안 된다. 노드가 실패하면 예외를
#    던지는데, 그러면 반환값이 없어 상태가 갱신되지 않는다. RetryPolicy는
#    "같은 상태로" 노드를 다시 부르므로 카운터가 영원히 0에 머문다.
#    실제로 그렇게 만들었다가 retrying 이 한 번도 화면에 뜨지 않았다.
_ATTEMPTS: dict[str, int] = {}


def _agent(agent_id: str) -> SubAgent:
    agent = orchestrator.AGENTS.get(agent_id)
    if agent is None:
        raise KeyError(f"에이전트를 찾을 수 없습니다: {agent_id}")
    return agent


async def _call_llm_node(state: AgentRunState) -> dict:
    """LLM을 부르는 노드. 실패하면 RetryPolicy가 이 함수를 다시 부른다.

    ⚠️ RetryPolicy는 재시도를 조용히 처리한다. 화면에 retrying이 뜨게 하려면
       노드가 직접 시도 횟수를 세어 보고해야 한다. 그래서 진입 시점에
       attempt를 보고 상태를 나눈다.
    """
    agent_id = state["agent_id"]
    agent = _agent(agent_id)
    attempt = _ATTEMPTS.get(agent_id, 0)

    if attempt == 0:
        agent.state = AgentState.RUNNING
        agent.retry_count = 0
        agent.message = state["task"]
    else:
        agent.state = AgentState.RETRYING
        agent.retry_count = attempt
        agent.message = f"{attempt}번째 재시도 중"

    agent.progress = min(0.9, 0.3 + attempt * 0.2)
    await orchestrator.report(agent)

    client = get_llm_client(agent.role)
    try:
        text = await client.complete([{"role": "user", "content": state["task"]}])
    except LLMError:
        # 다음 진입에서 retrying 으로 보고되도록 여기서 올린다
        _ATTEMPTS[agent_id] = attempt + 1
        raise

    _ATTEMPTS.pop(agent_id, None)
    return {"result": text}


async def _finish_node(state: AgentRunState) -> dict:
    agent = _agent(state["agent_id"])
    agent.state = AgentState.DONE
    agent.progress = 1.0
    agent.result = state["result"]
    agent.retry_count = 0
    # 대화풍선에 그대로 나가므로 5.2절대로 앞부분만 자른다
    agent.message = state["result"][:100]
    await orchestrator.report(agent)
    return {}


def build_agent_graph():
    """에이전트 하나가 돌릴 그래프. 노드 교체만으로 확장할 수 있게 최소로 둔다."""
    settings = get_settings()
    retry = RetryPolicy(
        max_attempts=settings.max_retry_count,
        initial_interval=settings.retry_initial_interval,
        backoff_factor=settings.retry_backoff_factor,
        retry_on=LLMError,
    )

    graph = StateGraph(AgentRunState)
    graph.add_node("call_llm", _call_llm_node, retry_policy=retry)
    graph.add_node("finish", _finish_node)
    graph.add_edge(START, "call_llm")
    graph.add_edge("call_llm", "finish")
    graph.add_edge("finish", END)
    return graph.compile()


_GRAPH = None


def _graph():
    global _GRAPH
    if _GRAPH is None:
        _GRAPH = build_agent_graph()
    return _GRAPH


async def run_agent(agent: SubAgent, task: str, wait_for: list[asyncio.Task] | None = None) -> str:
    """에이전트 하나를 처음부터 끝까지 돌린다.

    wait_for 가 있으면 그것들이 끝날 때까지 waiting 상태로 대기한다.
    이 대기 구간이 있어야 waiting 존이 비지 않는다.
    """
    orchestrator.MANAGED.add(agent.agent_id)
    try:
        if wait_for:
            agent.state = AgentState.WAITING
            agent.message = f"선행 작업 {len(wait_for)}건 대기 중"
            agent.progress = 0.1
            await orchestrator.report(agent)
            await asyncio.gather(*wait_for, return_exceptions=True)

        agent.task = task
        try:
            final = await _graph().ainvoke({"agent_id": agent.agent_id, "task": task})
            return final.get("result", "")
        except Exception as exc:  # noqa: BLE001 — 재시도 소진 등 모든 실패를 상태로 옮긴다
            # 명세 3.1절: error 는 "최대 재시도 소진 후 최종 실패"
            agent.state = AgentState.ERROR
            agent.retry_count = _ATTEMPTS.get(agent.agent_id, get_settings().max_retry_count)
            agent.message = f"재시도 소진 — {exc}"[:100]
            await orchestrator.report(agent)
            return ""
    finally:
        _ATTEMPTS.pop(agent.agent_id, None)
        orchestrator.MANAGED.discard(agent.agent_id)
        # 마지막 상태를 잠시 보여준 뒤 씬에서 내린다. 일회용 작업자라
        # 남겨 두면 done 존에 무한정 쌓인다 (설정: RUN_AGENT_LINGER_SECONDS).
        asyncio.create_task(_retire_later(agent.agent_id))  # noqa: RUF006


async def _retire_later(agent_id: str) -> None:
    await asyncio.sleep(get_settings().run_agent_linger_seconds)
    await orchestrator.retire(agent_id)


async def _make_agent(agent_id: str, name: str, role: str, parent_id: str | None) -> SubAgent:
    agent = SubAgent(
        agent_id=agent_id,
        name=name,
        role=role,
        state=AgentState.IDLE,
        position=STATE_ZONES[AgentState.IDLE],
        message="대기 중",
        parent_id=parent_id,
        updated_at=datetime.now(UTC),
    )
    # report()로 넣어야 생성 즉시 화면에 나타난다. db.upsert_agent만 부르면
    # 첫 상태 변화가 일어날 때까지 3D 씬에 아무것도 안 뜬다.
    await orchestrator.report(agent)
    return agent


async def run_research(question: str, researcher_count: int | None = None) -> str:
    """질문 하나를 리서치 파이프라인에 태운다. run_id 를 돌려준다.

    조사 → 검증 → 정리 순서이며, 검증과 정리는 선행 작업을 기다린다.
    """
    settings = get_settings()
    count = researcher_count or settings.research_agent_count
    count = max(1, min(count, len(RESEARCH_ANGLES)))

    stamp = datetime.now(UTC).strftime("%H%M%S")
    run_id = f"run-{stamp}"

    # 1) 조사 담당들 — 동시에 출발
    tasks: list[asyncio.Task] = []
    for i in range(count):
        angle = RESEARCH_ANGLES[i]
        agent = await _make_agent(
            f"{run_id}-researcher-{i + 1}", f"Researcher {i + 1}", "researcher", run_id
        )
        tasks.append(asyncio.create_task(run_agent(agent, f"{question} — {angle}")))

    # 2) 검증 담당 — 조사가 끝나야 시작 (waiting 발생 지점)
    reviewer = await _make_agent(f"{run_id}-reviewer", "Reviewer", "reviewer", run_id)
    review_task = asyncio.create_task(
        run_agent(reviewer, f"{question} — 조사 결과 교차 검증", wait_for=tasks)
    )

    # 3) 정리 담당 — 검증이 끝나야 시작
    writer = await _make_agent(f"{run_id}-writer", "Writer", "coder", run_id)
    asyncio.create_task(  # noqa: RUF006 — 끝까지 돌게 두고 결과는 DB로 확인한다
        run_agent(writer, f"{question} — 최종 정리", wait_for=[review_task])
    )

    return run_id


async def cancel_all() -> None:
    """종료 시 남은 그래프를 정리한다."""
    for task in list(asyncio.all_tasks()):
        if task.get_name().startswith("research-"):
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
