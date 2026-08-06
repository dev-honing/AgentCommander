"""Alembic 실행 환경.

연결 문자열은 DATABASE_URL 환경변수에서만 읽는다. alembic.ini에 값을
하드코딩하지 않는 이유는, 로컬 → AWS(RDS) 전환 시 코드를 고치지 않고
환경변수만 갈아끼우기 위해서다.
"""

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# backend/ 를 import 경로에 넣어 models_db 를 찾을 수 있게 한다
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from models_db import Base  # noqa: E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

database_url = os.environ.get("DATABASE_URL")
if not database_url:
    raise RuntimeError(
        "DATABASE_URL 환경변수가 없습니다. backend/.env.example 을 .env 로 복사하고 값을 채우세요."
    )
config.set_main_option("sqlalchemy.url", database_url)

# ⚠️ autogenerate 는 이 메타데이터만 본다. pydantic 모델(models.py)을 고쳐도
#    Alembic 은 아무것도 감지하지 못한다.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
