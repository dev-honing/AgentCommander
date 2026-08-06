'use client'

/**
 * 에이전트 목록 오버레이 (명세 7장 Phase 5).
 *
 * 캐릭터가 많아지면 3D만으로는 누가 멈췄는지 찾기 어렵다. 3D는 분위기를,
 * 이 목록은 정확도를 담당한다.
 *
 * 정렬 기본값이 최근 갱신순인 이유: 방금 움직인 것이 위로 올라와야
 * 이상 징후를 먼저 만난다.
 */

import { useMemo } from 'react'
import type { Agent } from '@/lib/protocol'
import { STATE_COLOR } from '@/lib/protocol'

type Props = {
  agents: Agent[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function AgentListPanel({ agents, selectedId, onSelect }: Props) {
  const sorted = useMemo(
    () =>
      [...agents].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '')),
    [agents],
  )

  return (
    <aside className="panel panel-list">
      <div className="panel-head">
        <span>에이전트 {agents.length}</span>
        <span className="panel-hint">최근 갱신순</span>
      </div>
      <div className="rows">
        {sorted.map((agent) => {
          const color = STATE_COLOR[agent.state]
          return (
            <button
              key={agent.agent_id}
              type="button"
              className={agent.agent_id === selectedId ? 'row row-sel' : 'row'}
              style={{ '--c': color } as React.CSSProperties}
              onClick={() => onSelect(agent.agent_id)}
            >
              <span className="row-dot" />
              <span className="row-name">{agent.name}</span>
              <span className="row-state">
                {agent.state}
                {agent.state === 'retrying' && ` ${agent.retry_count}`}
              </span>
              <span className="row-msg">{agent.message ?? '—'}</span>
              <span className="row-bar">
                <i style={{ width: `${Math.round(agent.progress * 100)}%` }} />
              </span>
              <span className="row-pct">{Math.round(agent.progress * 100)}%</span>
            </button>
          )
        })}
        {agents.length === 0 && (
          <div className="row-empty">
            수신된 에이전트가 없습니다. 백엔드가 실행 중인지 확인하세요.
          </div>
        )}
      </div>
    </aside>
  )
}
