"""테스트 공통 설정.

REST 테스트는 실제 PostgreSQL을 쓴다. FK 제약 위반을 409로 감싸는 동작처럼
DB가 있어야만 검증되는 것들이 명세의 테스트 우선순위에 들어 있기 때문이다
(11.5절: role 존재 검증, 역할 삭제 충돌).

DB가 없으면 해당 테스트만 건너뛴다 — Docker 없이 `pytest`를 돌려도
상태 전이 테스트는 그대로 통과해야 한다.
"""

import asyncio
import os
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]

# ⚠️ 백엔드 모듈을 import 하기 전에 환경변수를 세팅해야 한다.
#    config.get_settings()는 lru_cache라 첫 호출 시점의 값이 굳는다.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://user:pass@localhost:5432/subagent_viz_test"
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["API_KEY"] = "test-key"
os.environ["BACKGROUND_TASKS_ENABLED"] = "false"
os.environ.setdefault("UPLOAD_DIR", str(BACKEND_DIR / "uploads"))

API_KEY = "test-key"
AUTH = {"x-api-key": API_KEY}


def _split_url(url: str) -> tuple[str, str]:
    """연결 문자열에서 DB 이름을 떼어 (관리용 URL, DB명) 으로 나눈다."""
    base, _, dbname = url.rpartition("/")
    return f"{base}/postgres", dbname


async def _ensure_database() -> bool:
    """테스트용 DB가 없으면 만든다. 서버에 붙지 못하면 False."""
    import asyncpg

    admin_url, dbname = _split_url(TEST_DATABASE_URL)
    try:
        conn = await asyncio.wait_for(asyncpg.connect(admin_url), timeout=5)
    except Exception:
        return False

    try:
        exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", dbname)
        if not exists:
            # CREATE DATABASE는 파라미터 바인딩이 안 되므로 식별자를 직접 인용한다
            await conn.execute(f'CREATE DATABASE "{dbname}"')
    finally:
        await conn.close()
    return True


def _db_ready() -> bool:
    try:
        return asyncio.run(_ensure_database())
    except Exception:
        return False


DB_AVAILABLE = _db_ready()

requires_db = pytest.mark.skipif(
    not DB_AVAILABLE,
    reason=(
        f"PostgreSQL에 연결할 수 없습니다 ({TEST_DATABASE_URL}). "
        "docker compose up -d db 로 띄운 뒤 다시 실행하세요."
    ),
)


@pytest.fixture(scope="session", autouse=True)
def _migrate():
    """세션 시작 시 테스트 DB에 마이그레이션을 적용한다."""
    if not DB_AVAILABLE:
        yield
        return

    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    cfg.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    command.upgrade(cfg, "head")
    yield


@pytest.fixture
def client():
    """lifespan을 실제로 태운 TestClient.

    with 블록에 넣어야 lifespan이 돌아 DB 풀이 생성된다.
    """
    from fastapi.testclient import TestClient

    from main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _clean_agents():
    """테스트 간 에이전트/이력을 비운다. 역할 시드는 남긴다.

    agents가 roles를 FK로 참조하므로 지우는 순서가 중요하다.
    """
    yield
    if not DB_AVAILABLE:
        return

    import asyncpg

    async def wipe():
        conn = await asyncpg.connect(TEST_DATABASE_URL)
        try:
            await conn.execute("DELETE FROM agents")
            await conn.execute("DELETE FROM agent_logs")
            # 테스트가 추가한 역할만 제거하고 시드 3종은 남긴다
            await conn.execute(
                "DELETE FROM roles WHERE role_id NOT IN ('researcher','coder','reviewer')"
            )
        finally:
            await conn.close()

    asyncio.run(wipe())
