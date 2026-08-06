"""에이전트 REST API (명세 9.2 / 9.3절).

WebSocket은 실시간 상태 스트리밍 전용이고, 설정성 작업(생성/삭제)은 여기로
분리한다. 명세 4.2절에도 create_agent / terminate_agent WebSocket 메시지가
있으나 REST를 정본으로 삼는다 — docs/SPEC-NOTES.md 6번 항목.

생성/삭제가 일어나면 그 결과를 hub.broadcast()로 알려 프론트가 별도 폴링
없이 반영하게 한다.
"""

from fastapi import APIRouter, Depends

from auth import verify_api_key

router = APIRouter(prefix="/api/agents", dependencies=[Depends(verify_api_key)])


# TODO(Phase 5): 엔드포인트 구현 (명세 9.2절 표)
#
#   GET    ""                  에이전트 목록 (state 쿼리로 필터)
#   POST   ""                  생성 (name, role) → 201
#                              ⚠️ role 존재 여부를 앱 레벨에서 먼저 확인해 404로
#                                 명확히 응답한다. FK 제약은 최후 방어선이다.
#                              ⚠️ agent_id를 f"agent-{name.lower()}"로 만들면
#                                 동일 이름 재생성 시 충돌한다. 프로토타입에서는
#                                 단순함을 택하되 Phase 6 이후 UUID로 전환한다
#                                 (9장 주의사항).
#   GET    "/{agent_id}"       상세
#   PATCH  "/{agent_id}"       이름 등 수정
#   DELETE "/{agent_id}"       종료/삭제 → agent_removed 브로드캐스트
#   GET    "/{agent_id}/logs"  상태 이력 (limit/offset 페이지네이션, 복기용)
