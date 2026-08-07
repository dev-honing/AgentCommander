"""agents 에 task / result / parent_id 추가

Revision ID: 0002_agent_task
Revises: 0001_initial
Create Date: 2026-08-07

Phase 6에서 에이전트가 실제 작업을 하려면 "무엇을" 할지 담을 자리가 필요하다.
기존 행을 위해 전부 NULL 허용으로 둔다 — 목업 에이전트에는 지시가 없다.
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_agent_task"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agents", sa.Column("task", sa.Text(), nullable=True))
    op.add_column("agents", sa.Column("result", sa.Text(), nullable=True))
    op.add_column("agents", sa.Column("parent_id", sa.String(), nullable=True))
    # 한 작업에서 갈라져 나온 에이전트를 모아 보는 조회가 지배적이다
    op.create_index("idx_agents_parent_id", "agents", ["parent_id"])


def downgrade() -> None:
    op.drop_index("idx_agents_parent_id", table_name="agents")
    op.drop_column("agents", "parent_id")
    op.drop_column("agents", "result")
    op.drop_column("agents", "task")
