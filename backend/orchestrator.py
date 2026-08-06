"""에이전트 상태 생성기 (명세 6.2 / 11.2절).

Phase 0~5는 목업 루프가 상태를 무작위로 흔들어 파이프라인 전체
(상태 생성 → DB 저장 → WebSocket → 3D 반영 → 클릭 상호작용)를 검증한다.
Phase 6에서 이 파일의 내용만 LangGraph로 교체된다.

⚠️ 교체 시 바뀌는 것은 이 모듈뿐이어야 한다. WebSocket 메시지 스키마
   (models.py / protocol.ts)와 프론트엔드는 그대로 유지되어야 한다 — 2.2절.
   이 경계가 무너지면 프레임워크 결정 시점에 프론트까지 재작업하게 된다.
"""

# TODO(Phase 0): mock_state_loop()
#   2초마다 임의 에이전트의 상태를 바꾸고,
#   upsert_agent() 저장 후 agent_update를 브로드캐스트한다.
#   상태 전이 시 models.STATE_ZONES에서 목표 좌표를 찾아 position에 넣는다 (5.1절).

# TODO(Phase 6): LangGraph 연동
#   서브에이전트 1개 = LangGraph 그래프 1개(독립 실행) — 10.5절
#
#   from langgraph.graph import StateGraph
#   from langgraph.pregel import RetryPolicy
#
#   retry_policy = RetryPolicy(
#       max_attempts=settings.max_retry_count,        # 3
#       initial_interval=settings.retry_initial_interval,  # 1.0
#       backoff_factor=settings.retry_backoff_factor,      # 2.0 → 1s, 2s, 4s
#   )
#   graph.add_node("call_llm", call_llm_node, retry=retry_policy)
#
#   재시도가 발생할 때마다 state를 RETRYING으로 바꾸고 retry_count를 포함한
#   agent_update를 브로드캐스트해 대화풍선에 'N번째 재시도 중'이 뜨게 한다.
#   재시도를 모두 소진하면 ERROR로 최종 전이한다 (11.2절).
