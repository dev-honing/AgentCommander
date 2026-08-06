"""roles, agents, agent_logs 생성 + 기본 역할 시드

Revision ID: 0001_initial
Revises:
Create Date: 2026-08-06

기본 역할 시드가 이 마이그레이션에 포함된 이유:
agents.role은 roles.role_id를 FK로 참조하므로, 역할 레코드가 하나도 없으면
목업 오케스트레이터의 첫 에이전트 저장이 FK 위반(23503)으로 실패한다.
명세에는 이 시드가 빠져 있다 — docs/SPEC-NOTES.md 4번 항목 참고.
"""

import sqlalchemy as sa
from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

# 역할 수는 초기에 3~5종으로 제한한다. 하나 늘 때마다 캐릭터 에셋을 새로
# 준비해야 하기 때문이다.
DEFAULT_ROLES = [
    ("researcher", "Researcher", "/models/researcher.glb"),
    ("coder", "Coder", "/models/coder.glb"),
    ("reviewer", "Reviewer", "/models/reviewer.glb"),
]


def upgrade() -> None:
    roles = op.create_table(
        "roles",
        sa.Column("role_id", sa.String(), primary_key=True),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("model_path", sa.String(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )

    op.create_table(
        "agents",
        sa.Column("agent_id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("state", sa.String(), nullable=False, server_default="idle"),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("progress", sa.Float(), nullable=False, server_default="0"),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("pos_x", sa.Float(), nullable=False, server_default="0"),
        sa.Column("pos_y", sa.Float(), nullable=False, server_default="0"),
        sa.Column("pos_z", sa.Float(), nullable=False, server_default="0"),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        # 사용 중인 역할 삭제를 DB가 막는다. 이 위반은 앱에서 409로 감싼다.
        sa.ForeignKeyConstraint(["role"], ["roles.role_id"], name="fk_agents_role"),
    )

    # agent_logs는 agents를 FK로 참조하지 않는다 —
    # 에이전트를 삭제해도 이력은 남아야 복기가 가능하기 때문이다.
    op.create_table(
        "agent_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("agent_id", sa.String(), nullable=False),
        sa.Column("state", sa.String(), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    # 복기 쿼리는 "특정 에이전트의 최근 로그"가 지배적이다
    op.create_index("idx_agent_logs_agent_id", "agent_logs", ["agent_id", sa.text("created_at DESC")])
    # 보관 기간 정리는 created_at 만으로 스캔하므로 별도 인덱스가 필요하다
    op.create_index("idx_agent_logs_created_at", "agent_logs", ["created_at"])

    op.bulk_insert(
        roles,
        [
            {"role_id": rid, "display_name": name, "model_path": path}
            for rid, name, path in DEFAULT_ROLES
        ],
    )


def downgrade() -> None:
    op.drop_index("idx_agent_logs_created_at", table_name="agent_logs")
    op.drop_index("idx_agent_logs_agent_id", table_name="agent_logs")
    op.drop_table("agent_logs")
    op.drop_table("agents")
    op.drop_table("roles")
