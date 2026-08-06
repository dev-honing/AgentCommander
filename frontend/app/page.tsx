'use client'

/**
 * 메인 화면 (명세 7장 Phase 2 / 4 / 5).
 *
 * 3D 씬이 화면을 채우고, 목록과 상세 패널이 그 위에 겹친다. 상세를 열어도
 * 씬을 벗어나지 않는다는 것이 5.2절의 요구다.
 */

import { useCallback, useMemo } from 'react'
import { AgentDetailPanel } from '@/components/panel/AgentDetailPanel'
import { AgentListPanel } from '@/components/panel/AgentListPanel'
import { Scene } from '@/components/scene/Scene'
import { STATE_COLOR } from '@/lib/protocol'
import type { AgentState } from '@/lib/protocol'
import { useAgents } from '@/lib/useAgents'
import { useSelectedAgent } from '@/lib/useSelectedAgent'

const SUMMARY_ORDER: AgentState[] = ['running', 'retrying', 'waiting', 'error', 'done', 'idle']

export default function Home() {
  const { agents, speech, connected, connection, clickAgent, reconnectNow } = useAgents()
  const { selectedId, select } = useSelectedAgent()
  const list = useMemo(() => Object.values(agents), [agents])

  const selected = selectedId ? agents[selectedId] : undefined

  const handleSelect = useCallback(
    (id: string) => {
      select(id)
      // 클릭을 서버로 올리면 agent_speak가 돌아와 말풍선이 뜬다
      clickAgent(id)
    },
    [clickAgent, select],
  )

  const handleDeselect = useCallback(() => select(null), [select])

  const counts = useMemo(() => {
    const c = {} as Record<AgentState, number>
    list.forEach((a) => (c[a.state] = (c[a.state] ?? 0) + 1))
    return c
  }, [list])

  return (
    <main className="stage">
      <Scene
        agents={list}
        speech={speech}
        selectedId={selectedId}
        onSelect={handleSelect}
        onDeselect={handleDeselect}
      />

      <header className="hud hud-top">
        <span className="hud-brand">
          Agent<span>Commander</span>
        </span>
        <span className={connected ? 'hud-pill hud-live' : 'hud-pill hud-dead'}>
          {connected ? '● 연결됨' : '○ 연결 끊김'}
        </span>
        <span className="hud-spacer" />
        {SUMMARY_ORDER.filter((s) => counts[s]).map((s) => (
          <span key={s} className="hud-count">
            <i style={{ background: STATE_COLOR[s] }} />
            {s} {counts[s]}
          </span>
        ))}
      </header>

      <AgentListPanel agents={list} selectedId={selectedId} onSelect={handleSelect} />

      {/* key를 주면 다른 에이전트를 고를 때 패널이 새로 마운트되어
          이전 에이전트의 이력이 남지 않는다 */}
      {selected && (
        <AgentDetailPanel
          key={selected.agent_id}
          agent={selected}
          onClose={handleDeselect}
        />
      )}

      {/* 연결이 끊긴 동안에도 화면을 비우지 않는다. 마지막으로 받은 상태를
          그대로 두고 "이건 과거 값"이라고 알리는 편이 안전하다. */}
      {!connected && connection.attempt > 0 && (
        <div className="toast" role="status">
          <div className="toast-body">
            <div className="toast-title">서버와 연결이 끊겼습니다</div>
            <div className="toast-sub">
              화면의 상태는 마지막으로 받은 값입니다
              {connection.retryInSeconds !== null &&
                ` · ${connection.retryInSeconds}초 후 재시도 (${connection.attempt}번째)`}
            </div>
          </div>
          <button type="button" className="toast-btn" onClick={reconnectNow}>
            지금 시도
          </button>
        </div>
      )}
    </main>
  )
}

// TODO(Phase 3): AgentCube → AgentCharacter(리깅 glTF)로 교체.
//   교체 전에 큐브 20개 동시 렌더링 성능을 먼저 측정한다 (명세 10.1절).
//   backend/.env 의 MOCK_AGENT_COUNT 를 20으로 올리면 바로 확인할 수 있다.
