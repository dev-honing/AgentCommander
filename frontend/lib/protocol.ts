/**
 * WebSocket 메시지 스키마 (명세 4장).
 *
 * ⚠️ 이 파일은 backend/models.py 와 1:1로 대응한다. 한쪽만 고치면 런타임에
 *    조용히 어긋나므로 반드시 함께 수정할 것. 명세 2.2절이 "메시지 스키마를
 *    먼저 고정하라"고 강조하는 이유가 이것이다 — 목업을 LangGraph로 교체할 때
 *    이 계약이 흔들리면 프론트엔드까지 재작업하게 된다.
 */

/** 명세 3.1절. RETRYING을 RUNNING과 분리한 것이 핵심이다. */
export type AgentState =
  | 'idle'
  | 'running'
  | 'waiting'
  | 'retrying'
  | 'error'
  | 'done'

export type Position = [number, number, number]

export type Agent = {
  agent_id: string
  name: string
  role: string
  state: AgentState
  retry_count: number
  progress: number
  message: string | null
  /** 서버가 지정한 목표 좌표. 실제 이동은 프론트가 lerp로 보간한다 (5.1절). */
  position: Position
  updated_at: string | null

  /** 이 에이전트가 받은 지시 (Phase 6) */
  task: string | null
  /** 산출물 */
  result: string | null
  /** 어느 실행에서 갈라져 나왔는지. 목업 에이전트는 null */
  parent_id: string | null
}

export type Role = {
  role_id: string
  display_name: string
  model_path: string
}

export type AgentLog = {
  agent_id: string
  state: AgentState
  message: string | null
  retry_count: number
  created_at: string
}

// --- 서버 → 클라이언트 --------------------------------------------------

/** 접속 시 1회. 이후에는 변경분만 온다. */
export type AgentSnapshotMessage = {
  type: 'agent_snapshot'
  payload: Agent[]
}

export type AgentUpdateMessage = {
  type: 'agent_update'
  payload: Agent
}

/** 대화풍선에 표시할 텍스트 (5.2절). 100자 절삭된 상태로 온다. */
export type AgentSpeakMessage = {
  type: 'agent_speak'
  payload: { agent_id: string; text: string }
}

/** REST로 삭제된 에이전트를 씬에서 제거하라는 신호 (SPEC-NOTES 6번). */
export type AgentRemovedMessage = {
  type: 'agent_removed'
  payload: { agent_id: string }
}

export type ServerMessage =
  | AgentSnapshotMessage
  | AgentUpdateMessage
  | AgentSpeakMessage
  | AgentRemovedMessage

// --- 클라이언트 → 서버 --------------------------------------------------
//
// 생성/종료는 REST가 정본이므로(SPEC-NOTES 6번) 남는 것은 클릭뿐이다.

export type AgentClickMessage = {
  type: 'agent_click'
  payload: { agent_id: string }
}

export type ClientMessage = AgentClickMessage

/**
 * 상태 → 애니메이션 클립 이름 (명세 5.1절).
 *
 * ⚠️ 클립 이름은 Mixamo 등에서 받은 실제 에셋에 따라 달라진다.
 *    Phase 3에서 모델을 확보한 뒤 확정할 것.
 */
export const STATE_CLIP: Record<AgentState, string> = {
  idle: 'Idle',
  running: 'Working',
  waiting: 'LookAround',
  retrying: 'Retry',
  error: 'Alert',
  done: 'Cheer',
}

/** 상태 → 색상. Phase 2 큐브 스텁 단계에서 쓴다. */
export const STATE_COLOR: Record<AgentState, string> = {
  idle: '#9ca3af',
  running: '#22c55e',
  waiting: '#eab308',
  retrying: '#f97316',
  error: '#ef4444',
  done: '#3b82f6',
}

/**
 * 상태별 존 좌표 (명세 5.1절).
 *
 * ⚠️ backend/models.py의 STATE_ZONES와 같은 값이어야 한다.
 *    캐릭터의 실제 목표 좌표는 서버가 agent.position으로 내려주므로 여기 값을
 *    쓰지 않는다. 이 표는 바닥에 존 표식과 라벨을 그리는 용도다.
 */
export const STATE_ZONES: Record<AgentState, Position> = {
  idle: [0, 0, 0],
  running: [12, 0, 0],
  waiting: [12, 0, 9],
  retrying: [12, 0, 0], // running과 같은 구역 — 색과 이펙트로만 구분한다
  error: [-12, 0, 0],
  done: [0, 0, -12],
}

/** 바닥에 표식을 그릴 존. retrying은 running과 겹치므로 제외한다. */
export const MARKED_ZONES: AgentState[] = ['idle', 'running', 'waiting', 'error', 'done']
