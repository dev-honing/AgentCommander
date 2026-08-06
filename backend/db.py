"""asyncpg 연결 풀 및 런타임 쿼리 (명세 3.2 / 6.2절).

⚠️ 이 파일은 DDL을 실행하지 않는다. 명세 6.2절 샘플은 init_db()에서
   CREATE TABLE IF NOT EXISTS를 돌리지만, 11.3절이 Alembic 관리를 확정했으므로
   스키마 생성은 전적으로 마이그레이션이 담당한다.
   docs/SPEC-NOTES.md 2번 항목 참고.

FastAPI의 비동기 이벤트 루프와 자연스럽게 통합하기 위해 asyncpg + 커넥션 풀을
쓴다. PostgreSQL은 동시 쓰기를 잘 감당하므로 20개 에이전트의 초 단위 갱신
정도는 무리가 없다 (3.2절 주의사항).
"""

import asyncpg

from config import get_settings

_pool: asyncpg.Pool | None = None


async def init_pool() -> asyncpg.Pool:
    """연결 풀 생성. lifespan 시작 시 1회 호출한다."""
    global _pool
    settings = get_settings()
    _pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=10)
    return _pool


async def close_pool() -> None:
    """연결 풀 해제. lifespan 종료 시 호출한다."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError(
            "DB 풀이 초기화되지 않았습니다. lifespan에서 init_pool()을 먼저 호출하세요."
        )
    return _pool


# --- 이하 Phase 1에서 구현 ---------------------------------------------
#
# upsert_agent(agent)
#   agents(스냅샷)와 agent_logs(이력)에 같은 트랜잭션으로 동시 기록한다.
#   두 테이블을 나눈 이유는 조회 책임 분리다 — 3.2절.
#
# fetch_agents(state=None)          → GET /api/agents
# fetch_agent(agent_id)             → GET /api/agents/{agent_id}
# fetch_agent_logs(agent_id, ...)   → GET /api/agents/{agent_id}/logs (페이지네이션)
# insert_agent(...) / delete_agent(...)
# fetch_roles() / insert_role(...) / update_role(...) / delete_role(...)
