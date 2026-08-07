/**
 * 백엔드 REST 호출.
 *
 * 브라우저는 백엔드(:8000)를 직접 부르지 않고 같은 오리진의 프록시
 * (/api/backend/...)를 거친다. API Key가 브라우저로 새지 않게 하기 위해서다 —
 * app/api/backend/[...path]/route.ts 참고.
 */

import type { AgentLog, Role } from './protocol'

const BASE = '/api/backend'

export type LogPage = {
  total: number
  limit: number
  offset: number
  items: AgentLog[]
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, cache: 'no-store' })
  if (!res.ok) {
    // FastAPI는 오류를 {detail: ...} 로 돌려준다
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? `요청 실패 (${res.status})`)
  }
  return res.json() as Promise<T>
}

export function fetchAgentLogs(agentId: string, limit = 50, offset = 0): Promise<LogPage> {
  return request<LogPage>(
    `/agents/${encodeURIComponent(agentId)}/logs?limit=${limit}&offset=${offset}`,
  )
}

export function fetchRoles(): Promise<Role[]> {
  return request<Role[]>('/roles')
}

export type WsTicket = {
  ticket: string
  expires_in: number
}

/**
 * WebSocket 접속용 1회용 티켓을 받아 온다.
 *
 * 브라우저의 WebSocket API 는 핸드셰이크에 헤더를 붙일 수 없어 REST 처럼
 * X-API-Key 를 실을 수 없다. 그렇다고 키를 쿼리스트링에 넣으면 브라우저로
 * 새는 데다 로그에도 남는다. 그래서 키를 아는 프록시가 대신 티켓을 받아 온다.
 *
 * 티켓은 30초짜리 1회용이라 접속할 때마다 새로 받아야 한다 — 재연결도 마찬가지다.
 */
export function fetchWsTicket(): Promise<WsTicket> {
  return request<WsTicket>('/ws-ticket', { method: 'POST' })
}

export type RunCreated = {
  run_id: string
  question: string
  agents: string[]
}

/**
 * 리서치 실행을 시작한다.
 *
 * 202로 접수만 되고 작업은 계속 돈다. 진행 상황은 WebSocket으로 흘러오므로
 * 이 응답을 기다렸다가 화면을 갱신할 필요가 없다.
 */
export function createRun(question: string, researchers?: number): Promise<RunCreated> {
  return request<RunCreated>('/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question, researchers }),
  })
}
