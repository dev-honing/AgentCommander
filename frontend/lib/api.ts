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
