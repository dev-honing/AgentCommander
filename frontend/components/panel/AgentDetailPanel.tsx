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

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchAgentLogs } from '@/lib/api'
import type { Agent, AgentLog } from '@/lib/protocol'
import { STATE_COLOR } from '@/lib/protocol'
import { runColor } from '@/lib/runColor'

const PAGE_SIZE = 30

/**
 * yyyy-mm-dd hh:mm:ss (로컬 시각).
 *
 * toLocaleString은 로케일에 따라 "2026. 8. 7. 00:21:56"처럼 자릿수가 들쭉날쭉해
 * 세로로 정렬되지 않는다. 로그는 시각을 눈으로 훑는 화면이라 자릿수 고정이
 * 중요하므로 직접 조립한다.
 */
function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  )
}

export function AgentDetailPanel({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [total, setTotal] = useState(0)
  // 마운트하자마자 첫 페이지를 읽으므로 로딩 상태로 시작한다.
  // 이렇게 두면 아래 이펙트가 setState를 동기로 부를 필요가 없다.
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const agentId = agent.agent_id
  /** 겹친 요청 중 마지막 것만 반영하기 위한 순번 */
  const seq = useRef(0)

  /** 상태 변경이 전부 await 이후에만 일어나도록 짠 fetch */
  const fetchPage = useCallback(
    async (offset: number) => {
      const mine = ++seq.current
      try {
        const page = await fetchAgentLogs(agentId, PAGE_SIZE, offset)
        // 늦게 도착한 옛 응답이 새 결과를 덮어쓰지 않게 한다
        if (mine !== seq.current) return
        setTotal(page.total)
        setLogs((prev) => (offset === 0 ? page.items : [...prev, ...page.items]))
      } catch (e) {
        if (mine !== seq.current) return
        setError(e instanceof Error ? e.message : '이력을 불러오지 못했습니다')
      } finally {
        if (mine === seq.current) setLoading(false)
      }
    },
    [agentId],
  )

  // "더 보기"로 펼쳐 둔 상태인지. 펼쳐서 옛 이력을 읽는 중이라면 자동 갱신이
  // 목록을 되감아 버리므로 건드리지 않는다.
  const expanded = logs.length > PAGE_SIZE

  // 에이전트가 갱신될 때마다 이력을 다시 읽는다.
  //
  // 마운트 때 한 번만 읽으면 패널을 열어 둔 동안 이력이 멈춰 있다. 상태
  // 필드는 WebSocket 으로 실시간 갱신되는데 이력만 옛것이라, 최신순 목록
  // 맨 위에 오래된 상태가 계속 남아 "패널이 안 바뀐다"로 읽혔다.
  //
  // updated_at 을 의존성으로 쓰는 이유: 상태뿐 아니라 진행률·메시지만 바뀌어도
  // 이력에는 새 줄이 쌓이기 때문이다.
  //
  // set-state-in-effect 규칙은 "이펙트에서 데이터를 가져오지 말라"는 취지라
  // await 이후의 갱신까지 잡는다. 다만 ?agent=... 링크를 새로고침으로 열면
  // 클릭 없이 패널이 뜨므로 이 조회를 없앨 수 없다.
  useEffect(() => {
    if (expanded) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 위 주석 참고
    void fetchPage(0)
  }, [fetchPage, expanded, agent.updated_at])

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

        {/* 실행에 속한 에이전트만 지시와 산출물을 갖는다 (Phase 6) */}
        {agent.parent_id && (
          <div className="detail-run">
            <div className="detail-run-head">
              <span className="run-swatch" style={{ background: runColor(agent.parent_id) }} />
              {agent.parent_id}
            </div>
            {agent.task && (
              <p className="detail-block">
                <span className="detail-block-label">지시</span>
                {agent.task}
              </p>
            )}
            {agent.result && (
              <p className="detail-block">
                <span className="detail-block-label">결과</span>
                {agent.result}
              </p>
            )}
          </div>
        )}
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
            <time dateTime={log.created_at}>{formatTimestamp(log.created_at)}</time>
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
