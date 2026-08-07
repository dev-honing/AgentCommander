"""asyncpg 연결 풀 및 런타임 쿼리 (명세 3.2 / 6.2절).

⚠️ 이 파일은 DDL을 실행하지 않는다. 명세 6.2절 샘플은 init_db()에서
   CREATE TABLE IF NOT EXISTS를 돌리지만, 11.3절이 Alembic 관리를 확정했으므로
   스키마 생성은 전적으로 마이그레이션이 담당한다.
   docs/SPEC-NOTES.md 2번 항목 참고.

FastAPI의 비동기 이벤트 루프와 자연스럽게 통합하기 위해 asyncpg + 커넥션 풀을
쓴다. PostgreSQL은 동시 쓰기를 잘 감당하므로 20개 에이전트의 초 단위 갱신
정도는 무리가 없다 (3.2절 주의사항).
"""

from datetime import UTC, datetime

import asyncpg

from config import get_settings
from models import STATE_ZONES, AgentLog, AgentState, Role, SubAgent

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


def _row_to_agent(row: asyncpg.Record) -> SubAgent:
    return SubAgent(
        agent_id=row["agent_id"],
        name=row["name"],
        role=row["role"],
        state=AgentState(row["state"]),
        retry_count=row["retry_count"],
        progress=row["progress"],
        message=row["message"],
        position=(row["pos_x"], row["pos_y"], row["pos_z"]),
        updated_at=row["updated_at"],
        task=row["task"],
        result=row["result"],
        parent_id=row["parent_id"],
    )


# --- 에이전트 ----------------------------------------------------------


async def upsert_agent(agent: SubAgent) -> None:
    """스냅샷과 이력을 같은 트랜잭션으로 기록한다 (명세 3.2절).

    agents는 최신 상태만, agent_logs는 전 이력을 갖는다. 조회 책임을 나눠
    상태 조회는 빠르게, 복기는 로그 테이블만 스캔하게 하려는 분리다.
    """
    now = agent.updated_at or datetime.now(UTC)
    x, y, z = agent.position

    async with get_pool().acquire() as conn, conn.transaction():
        await conn.execute(
            """
            INSERT INTO agents
              (agent_id, name, role, state, retry_count, progress, message,
               pos_x, pos_y, pos_z, updated_at, task, result, parent_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            ON CONFLICT (agent_id) DO UPDATE SET
              state       = EXCLUDED.state,
              retry_count = EXCLUDED.retry_count,
              progress    = EXCLUDED.progress,
              message     = EXCLUDED.message,
              pos_x       = EXCLUDED.pos_x,
              pos_y       = EXCLUDED.pos_y,
              pos_z       = EXCLUDED.pos_z,
              updated_at  = EXCLUDED.updated_at,
              task        = EXCLUDED.task,
              result      = EXCLUDED.result,
              parent_id   = EXCLUDED.parent_id
            """,
            agent.agent_id,
            agent.name,
            agent.role,
            agent.state.value,
            agent.retry_count,
            agent.progress,
            agent.message,
            x,
            y,
            z,
            now,
            agent.task,
            agent.result,
            agent.parent_id,
        )
        await conn.execute(
            """
            INSERT INTO agent_logs (agent_id, state, message, retry_count, created_at)
            VALUES ($1,$2,$3,$4,$5)
            """,
            agent.agent_id,
            agent.state.value,
            agent.message,
            agent.retry_count,
            now,
        )


async def fetch_agents() -> list[SubAgent]:
    async with get_pool().acquire() as conn:
        rows = await conn.fetch("SELECT * FROM agents ORDER BY agent_id")
    return [_row_to_agent(r) for r in rows]


async def fetch_agent(agent_id: str) -> SubAgent | None:
    async with get_pool().acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM agents WHERE agent_id = $1", agent_id)
    return _row_to_agent(row) if row else None


async def insert_agent(agent: SubAgent) -> None:
    """새 에이전트를 등록한다. 이력에도 최초 상태를 남긴다."""
    await upsert_agent(agent)


async def delete_agent(agent_id: str) -> bool:
    """에이전트를 지운다. 이력(agent_logs)은 복기를 위해 남긴다."""
    async with get_pool().acquire() as conn:
        result = await conn.execute("DELETE FROM agents WHERE agent_id = $1", agent_id)
    return result.endswith(" 1")


async def fetch_agent_logs(agent_id: str, limit: int = 50, offset: int = 0) -> list[AgentLog]:
    async with get_pool().acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT agent_id, state, message, retry_count, created_at
            FROM agent_logs
            WHERE agent_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            """,
            agent_id,
            limit,
            offset,
        )
    return [
        AgentLog(
            agent_id=r["agent_id"],
            state=AgentState(r["state"]),
            message=r["message"],
            retry_count=r["retry_count"],
            created_at=r["created_at"],
        )
        for r in rows
    ]


async def count_agent_logs(agent_id: str | None = None) -> int:
    async with get_pool().acquire() as conn:
        if agent_id is None:
            return await conn.fetchval("SELECT count(*) FROM agent_logs")
        return await conn.fetchval("SELECT count(*) FROM agent_logs WHERE agent_id = $1", agent_id)


async def purge_old_logs(retention_days: int) -> int:
    """보관 기간이 지난 이력을 지우고 삭제 행 수를 돌려준다.

    agent_logs는 append-only라 방치하면 무한정 쌓인다 — 20개 에이전트가
    2초마다 갱신되면 하루 약 86만 행이다. 명세가 "Phase 1에서 함께 설계할 것"
    으로 남겨 둔 항목이며, 30일 보관으로 확정했다.
    """
    async with get_pool().acquire() as conn:
        result = await conn.execute(
            "DELETE FROM agent_logs WHERE created_at < now() - ($1 || ' days')::interval",
            str(retention_days),
        )
    # asyncpg는 "DELETE <n>" 형태의 태그를 돌려준다
    return int(result.rsplit(" ", 1)[-1] or 0)


# --- 역할 --------------------------------------------------------------


async def fetch_roles() -> list[Role]:
    async with get_pool().acquire() as conn:
        rows = await conn.fetch("SELECT * FROM roles ORDER BY role_id")
    return [
        Role(
            role_id=r["role_id"],
            display_name=r["display_name"],
            model_path=r["model_path"],
            created_at=r["created_at"],
        )
        for r in rows
    ]


async def role_exists(role_id: str) -> bool:
    async with get_pool().acquire() as conn:
        return bool(await conn.fetchval("SELECT 1 FROM roles WHERE role_id = $1", role_id))


# --- 목업 시드 ---------------------------------------------------------


async def seed_mock_agents(agents: list[SubAgent]) -> None:
    """DB가 비어 있을 때만 목업 에이전트를 넣는다.

    이미 있으면 건드리지 않는다 — 서버를 재시작해도 이전 상태와 이력이
    이어져야 "복기 가능"이라는 요구가 성립한다 (명세 7장 Phase 1 완료 기준).
    """
    async with get_pool().acquire() as conn:
        existing = await conn.fetchval("SELECT count(*) FROM agents")
    if existing:
        return
    for agent in agents:
        agent.position = STATE_ZONES[agent.state]
        await upsert_agent(agent)
