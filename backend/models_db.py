"""SQLAlchemy 모델 — DB 스키마 정의 전용 (명세 3.2 / 9.1절).

⚠️ 이 파일은 ORM으로 쓰지 않는다. 런타임 쿼리는 db.py의 asyncpg가 담당한다.
   SQLAlchemy를 두는 유일한 이유는 Alembic의 --autogenerate가 스키마를
   인식하려면 SQLAlchemy 메타데이터가 필요하기 때문이다.
   이 분리의 근거는 docs/SPEC-NOTES.md 2번 항목 참고.

⚠️ 테이블을 추가/변경할 때는 이 파일을 먼저 고치고 마이그레이션을 생성한다.
   models.py(pydantic)를 고쳐도 Alembic은 아무것도 감지하지 못한다.
"""

from sqlalchemy import (
    BigInteger,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Text,
    desc,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData()


class RoleTable(Base):
    """동적으로 관리되는 역할 정의 (명세 9.1절).

    역할 추가가 곧 캐릭터 등록이므로, model_path는 필수다.
    """

    __tablename__ = "roles"

    role_id: Mapped[str] = mapped_column(String, primary_key=True)  # 예: 'researcher'
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    model_path: Mapped[str] = mapped_column(String, nullable=False)  # 예: '/models/researcher.glb'
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AgentTable(Base):
    """현재 상태 스냅샷 (명세 3.2절).

    이력(agent_logs)과 분리한 이유: 상태 조회는 최신 스냅샷만 필요해 빠르게,
    복기는 로그 테이블만 스캔하도록 책임을 나누기 위함이다.
    """

    __tablename__ = "agents"

    agent_id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)

    # FK 제약 덕분에 사용 중인 역할 삭제가 DB 레벨에서 자동 차단된다 (9.1절).
    # 단, 그 에러(23503)를 그대로 노출하지 말고 409로 감싸야 한다 — 9장 주의사항.
    role: Mapped[str] = mapped_column(String, ForeignKey("roles.role_id"), nullable=False)

    state: Mapped[str] = mapped_column(String, nullable=False, default="idle")

    # 명세 3.1절 SubAgent에는 있으나 3.2/6.2의 DDL에는 빠져 있던 컬럼.
    # 5.1절("retry_count를 대화풍선에 노출")과 11.2절이 요구하므로 반드시 영속화한다.
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    progress: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 상태별 존 좌표 (5.1절). 서버는 목표 좌표만 기록하고,
    # 프론트가 lerp로 보간하며 이동시킨다.
    pos_x: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    pos_y: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    pos_z: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AgentLogTable(Base):
    """상태 변화 이력 — append-only, 복기용 (명세 3.2절).

    ⚠️ 이 테이블은 무한정 쌓인다. 20개 에이전트가 2초마다 갱신되면
       하루 약 86만 행이다. 보관 기간(retention) 정책 또는 주기적 아카이빙을
       Phase 1에서 반드시 함께 설계할 것 — 나중에 급히 정리하면
       마이그레이션 비용이 커진다 (3.2 / 10.2절).
    """

    __tablename__ = "agent_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    agent_id: Mapped[str] = mapped_column(String, nullable=False)
    state: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        # 복기 쿼리는 "특정 에이전트의 최근 로그"가 지배적이다 (9.2절 GET .../logs).
        Index("idx_agent_logs_agent_id", "agent_id", desc("created_at")),
    )


# agent_logs는 agents를 FK로 참조하지 않는다.
# 에이전트를 삭제해도 그 이력은 남아야 복기가 가능하기 때문이다.
