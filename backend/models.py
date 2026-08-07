"""pydantic 모델 — API 스키마 및 WebSocket 메시지 페이로드 (명세 3.1 / 4장).

⚠️ 이 파일은 DB 스키마가 아니다. 테이블 정의는 models_db.py(SQLAlchemy)에 있고,
   Alembic autogenerate는 그쪽만 인식한다. 명세 11.3절 주의사항 참고.

⚠️ 이 파일의 WebSocket 메시지 정의는 frontend/lib/protocol.ts 와 1:1로 대응한다.
   한쪽만 고치면 런타임에 조용히 어긋나므로 반드시 함께 수정할 것.
   명세 2.2절이 "메시지 스키마를 먼저 고정하라"고 강조하는 이유가 이것이다.
"""

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field


class AgentState(StrEnum):
    """서브에이전트 상태 (명세 3.1절).

    RETRYING을 RUNNING과 분리한 것이 핵심이다 — 정상 진행과 재시도는
    화면에서 시각적으로 구분되어야 한다. ERROR는 재시도를 모두 소진한
    뒤에만 도달하는 최종 실패 상태다.
    """

    IDLE = "idle"
    RUNNING = "running"
    WAITING = "waiting"  # 다른 에이전트/외부 응답 대기
    RETRYING = "retrying"  # 자동 재시도 중
    ERROR = "error"  # 최대 재시도 소진 후 최종 실패
    DONE = "done"


Position = tuple[float, float, float]

# 상태별 존(zone) 좌표 (명세 5.1절).
#
# 존은 역할별로 나누지 않고 상태별로 4~5개만 유지한다. 서버는 목표 좌표만
# 내려주고 실제 보간(lerp)은 프론트가 useFrame에서 처리한다 — 매 프레임
# 좌표를 브로드캐스트할 필요가 없어 WebSocket 트래픽이 절약된다.
#
# retrying은 running과 같은 좌표를 쓴다. 위치가 아니라 애니메이션과
# 이펙트로만 구분한다.
STATE_ZONES: dict[AgentState, Position] = {
    AgentState.IDLE: (0.0, 0.0, 0.0),
    AgentState.RUNNING: (5.0, 0.0, 0.0),
    AgentState.WAITING: (5.0, 0.0, 3.0),
    AgentState.RETRYING: (5.0, 0.0, 0.0),
    AgentState.ERROR: (-5.0, 0.0, 0.0),
    AgentState.DONE: (0.0, 0.0, -5.0),
}


class SubAgent(BaseModel):
    """에이전트 현재 상태 스냅샷 (명세 3.1절)."""

    agent_id: str
    name: str
    role: str  # roles.role_id 참조 — 캐릭터 외형(glTF) 매핑 키
    state: AgentState = AgentState.IDLE
    retry_count: int = 0  # RETRYING일 때 현재 시도 횟수
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    message: str | None = None  # 현재 작업 로그 한 줄 요약
    position: Position = (0.0, 0.0, 0.0)
    updated_at: datetime | None = None

    # --- Phase 6: 실제 작업 ---
    task: str | None = None  # 이 에이전트가 받은 지시
    result: str | None = None  # 산출물
    # 어느 작업에서 갈라져 나왔는지. 나중에 3D 씬에서 에이전트 사이를
    # 선으로 잇는 연출의 근거가 된다.
    parent_id: str | None = None


class Role(BaseModel):
    """역할 정의 (명세 9.1절).

    역할을 코드에 고정하지 않고 API로 관리하므로, 새 역할을 추가하는 것이
    곧 새 캐릭터를 등록하는 행위가 된다.
    """

    role_id: str  # 예: 'researcher'
    display_name: str  # 예: 'Researcher'
    model_path: str  # 예: '/models/researcher.glb'
    created_at: datetime | None = None


class AgentLog(BaseModel):
    """상태 변화 이력 한 건 (명세 3.2절, append-only)."""

    agent_id: str
    state: AgentState
    message: str | None = None
    retry_count: int = 0
    created_at: datetime


# --- 요청 바디 (REST) ---------------------------------------------------


class AgentCreate(BaseModel):
    name: str
    role: str  # roles.role_id를 참조해야 함


class AgentPatch(BaseModel):
    name: str | None = None


class RoleCreate(BaseModel):
    role_id: str
    display_name: str
    model_path: str


class RolePatch(BaseModel):
    display_name: str | None = None


# --- WebSocket 메시지 (명세 4장) ----------------------------------------
#
# 서버 → 클라이언트. 접속 시 1회 전체 스냅샷을 보내고, 이후에는 변경분만
# 보낸다. 에이전트 수가 늘어도 트래픽이 선형으로 커지지 않도록 하기 위함이다.


class AgentSpeakPayload(BaseModel):
    agent_id: str
    text: str


class AgentRefPayload(BaseModel):
    """에이전트 하나를 가리키기만 하는 페이로드."""

    agent_id: str


class AgentSnapshotMessage(BaseModel):
    type: Literal["agent_snapshot"] = "agent_snapshot"
    payload: list[SubAgent]


class AgentUpdateMessage(BaseModel):
    type: Literal["agent_update"] = "agent_update"
    payload: SubAgent


class AgentSpeakMessage(BaseModel):
    """대화풍선에 표시할 텍스트.

    최근 LLM 응답을 별도 요약 호출 없이 앞부분만 잘라 쓴다(100자 절삭).
    추가 비용과 지연이 없다는 것이 이 선택의 이유다 — 명세 5.2절.
    """

    type: Literal["agent_speak"] = "agent_speak"
    payload: AgentSpeakPayload


class AgentRemovedMessage(BaseModel):
    """REST로 에이전트가 삭제되었음을 알린다.

    명세 4.2절은 terminate_agent를 클라이언트→서버 WebSocket 메시지로 두었으나,
    9장의 "설정성 작업은 REST" 원칙에 따라 REST를 정본으로 삼고 결과만
    이 메시지로 브로드캐스트한다. docs/SPEC-NOTES.md 6번 항목 참고.
    """

    type: Literal["agent_removed"] = "agent_removed"
    payload: AgentRefPayload


# 클라이언트 → 서버.
# 생성/종료는 REST로 옮겼으므로 남는 것은 클릭 상호작용뿐이다.


class AgentClickMessage(BaseModel):
    type: Literal["agent_click"] = "agent_click"
    payload: AgentRefPayload


ServerMessage = AgentSnapshotMessage | AgentUpdateMessage | AgentSpeakMessage | AgentRemovedMessage
ClientMessage = AgentClickMessage
