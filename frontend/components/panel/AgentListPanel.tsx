'use client'

/**
 * 에이전트 목록 오버레이 (명세 7장 Phase 5, Phase 6d에서 실행 단위로 묶음).
 *
 * 캐릭터가 많아지면 3D만으로는 누가 멈췄는지 찾기 어렵다. 3D는 분위기를,
 * 이 목록은 정확도를 담당한다.
 *
 * 실행(run)별로 묶는 이유: 질문 여러 개를 동시에 던지면 에이전트가 20개까지
 * 늘어나는데, 평평한 목록으로는 "어느 질문에서 나온 것인지" 알 수 없다.
 */

import { useMemo } from 'react'
import type { Agent } from '@/lib/protocol'
import { STATE_COLOR } from '@/lib/protocol'
import { runColor } from '@/lib/runColor'

type Props = {
  agents: Agent[]
  selectedId: string | null
  onSelect: (id: string) => void
}

type Group = {
  /** 실행 id. 목업 에이전트는 null */
  runId: string | null
  color: string | null
  agents: Agent[]
  done: number
}

/** 최근 갱신순 — 방금 움직인 것이 위로 와야 이상 징후를 먼저 만난다 */
function byRecent(a: Agent, b: Agent) {
  return (b.updated_at ?? '').localeCompare(a.updated_at ?? '')
}

function group(agents: Agent[]): Group[] {
  const runs = new Map<string, Agent[]>()
  const loose: Agent[] = []

  agents.forEach((a) => {
    if (!a.parent_id) {
      loose.push(a)
      return
    }
    const bucket = runs.get(a.parent_id)
    if (bucket) bucket.push(a)
    else runs.set(a.parent_id, [a])
  })

  const groups: Group[] = [...runs.entries()]
    // 실행 id 가 run-HHMMSS 라 역순 정렬이면 최근 실행이 위로 온다
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([runId, list]) => ({
      runId,
      color: runColor(runId),
      agents: [...list].sort(byRecent),
      done: list.filter((a) => a.state === 'done').length,
    }))

  if (loose.length) {
    groups.push({
      runId: null,
      color: null,
      agents: [...loose].sort(byRecent),
      done: loose.filter((a) => a.state === 'done').length,
    })
  }
  return groups
}

export function AgentListPanel({ agents, selectedId, onSelect }: Props) {
  const groups = useMemo(() => group(agents), [agents])

  return (
    <aside className="panel panel-list">
      <div className="panel-head">
        <span>에이전트 {agents.length}</span>
        <span className="panel-hint">최근 갱신순</span>
      </div>

      <div className="rows">
        {groups.map((g) => (
          <div key={g.runId ?? '__loose'} className="run-group">
            <div
              className="run-head"
              style={g.color ? ({ '--r': g.color } as React.CSSProperties) : undefined}
            >
              {g.color && <span className="run-swatch" />}
              <span className="run-name">{g.runId ?? '상시 대기'}</span>
              <span className="run-count">
                {g.done}/{g.agents.length}
              </span>
            </div>

            {g.agents.map((agent) => {
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
          </div>
        ))}

        {agents.length === 0 && (
          <div className="row-empty">
            돌고 있는 에이전트가 없습니다.
            <br />
            아래에 질문을 넣으면 조사가 시작됩니다.
          </div>
        )}
      </div>
    </aside>
  )
}
