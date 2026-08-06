'use client'

/**
 * 에이전트 상세 사이드패널 (명세 5.2절 / Phase 5).
 *
 * 클릭하면 3D 씬을 벗어나지 않고 우측에서 슬라이드인한다. 페이지를 갈아타지
 * 않으므로 씬의 맥락이 유지된다.
 *
 * 이력은 실시간 스트림이 아니라 REST로 따로 읽는다 — 상태 조회(스냅샷)와
 * 복기 조회의 책임을 나눠 둔 3.2절 설계 때문이다.
 */

import { useCallback, useEffect, useState } from 'react'
import { fetchAgentLogs } from '@/lib/api'
import type { Agent, AgentLog } from '@/lib/protocol'
import { STATE_COLOR } from '@/lib/protocol'

const PAGE_SIZE = 30

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('ko-KR', { hour12: false })
}

export function AgentDetailPanel({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [total, setTotal] = useState(0)
  // 마운트하자마자 첫 페이지를 읽으므로 로딩 상태로 시작한다.
  // 이렇게 두면 아래 이펙트가 setState를 동기로 부를 필요가 없다.
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const agentId = agent.agent_id

  /** 상태 변경이 전부 await 이후에만 일어나도록 짠 fetch */
  const fetchPage = useCallback(
    async (offset: number) => {
      try {
        const page = await fetchAgentLogs(agentId, PAGE_SIZE, offset)
        setTotal(page.total)
        setLogs((prev) => (offset === 0 ? page.items : [...prev, ...page.items]))
      } catch (e) {
        setError(e instanceof Error ? e.message : '이력을 불러오지 못했습니다')
      } finally {
        setLoading(false)
      }
    },
    [agentId],
  )

  // 마운트 시 첫 페이지 조회.
  //
  // 다른 에이전트를 고르면 부모가 key로 이 컴포넌트를 새로 마운트하므로
  // (page.tsx 참고) 여기서 이전 목록을 지울 필요가 없다.
  //
  // set-state-in-effect 규칙은 "이펙트에서 데이터를 가져오지 말라"는 취지라
  // await 이후의 상태 갱신까지 잡는다. 다만 ?agent=... 링크를 새로고침으로
  // 열면 클릭 없이 패널이 뜨므로 마운트 시점 조회를 없앨 수 없다. 데이터
  // 라이브러리나 Suspense 캐시를 도입하기 전까지는 이 형태가 최선이다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 위 주석 참고
    void fetchPage(0)
  }, [fetchPage])

  /** "더 보기" — 이벤트 핸들러이므로 즉시 상태를 바꿔도 된다 */
  const loadMore = useCallback(() => {
    setLoading(true)
    setError(null)
    void fetchPage(logs.length)
  }, [fetchPage, logs.length])

  // Esc로 닫기 — 3D 씬을 조작하다 마우스를 옮기지 않고 빠져나올 수 있게
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const color = STATE_COLOR[agent.state]

  return (
    <aside className="panel panel-detail" style={{ '--c': color } as React.CSSProperties}>
      <div className="panel-head">
        <span>에이전트 상세</span>
        <button type="button" className="panel-x" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </div>

      <div className="detail-hero">
        <div className="detail-name">
          <span className="row-dot" />
          {agent.name}
        </div>
        <div className="row-bar detail-bar">
          <i style={{ width: `${Math.round(agent.progress * 100)}%` }} />
        </div>
        <dl className="kv">
          <div>
            <dt>agent_id</dt>
            <dd>{agent.agent_id}</dd>
          </div>
          <div>
            <dt>role</dt>
            <dd>{agent.role}</dd>
          </div>
          <div>
            <dt>state</dt>
            <dd style={{ color }}>{agent.state}</dd>
          </div>
          <div>
            <dt>progress</dt>
            <dd>{Math.round(agent.progress * 100)}%</dd>
          </div>
          <div>
            <dt>retry_count</dt>
            <dd>{agent.retry_count}</dd>
          </div>
          <div>
            <dt>message</dt>
            <dd>{agent.message ?? '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="detail-sec">
        상태 이력 <span className="panel-hint">{total.toLocaleString()}건</span>
      </div>

      <div className="loglist">
        {error && <div className="log-error">{error}</div>}
        {logs.map((log, i) => (
          <div
            key={`${log.created_at}-${i}`}
            className="logline"
            style={{ '--c': STATE_COLOR[log.state] } as React.CSSProperties}
          >
            <time>{formatTime(log.created_at)}</time>
            <span className="log-state">
              {log.state}
              {log.state === 'retrying' && ` ${log.retry_count}`}
            </span>
            <span className="log-msg">{log.message ?? '—'}</span>
          </div>
        ))}
        {logs.length < total && (
          <button type="button" className="log-more" onClick={loadMore} disabled={loading}>
            {loading ? '불러오는 중...' : `더 보기 (${total - logs.length}건 남음)`}
          </button>
        )}
        {!loading && !error && logs.length === 0 && (
          <div className="log-empty">이력이 없습니다.</div>
        )}
      </div>
    </aside>
  )
}
