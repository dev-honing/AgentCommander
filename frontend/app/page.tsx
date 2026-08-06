'use client'

/**
 * 메인 화면 (명세 7장 Phase 2).
 *
 * 3D 씬이 화면을 채우고, 상태 요약은 그 위에 얇게 겹친다.
 * 상세 사이드패널과 전체 목록 패널은 Phase 5에서 붙는다.
 */

import { useMemo } from 'react'
import { Scene } from '@/components/scene/Scene'
import { STATE_COLOR } from '@/lib/protocol'
import type { AgentState } from '@/lib/protocol'
import { useAgents } from '@/lib/useAgents'

const SUMMARY_ORDER: AgentState[] = ['running', 'retrying', 'waiting', 'error', 'done', 'idle']

export default function Home() {
  const { agents, connected, clickAgent } = useAgents()
  const list = useMemo(() => Object.values(agents), [agents])

  const counts = useMemo(() => {
    const c = {} as Record<AgentState, number>
    list.forEach((a) => (c[a.state] = (c[a.state] ?? 0) + 1))
    return c
  }, [list])

  return (
    <main className="stage">
      <Scene agents={list} onSelect={clickAgent} />

      <header className="hud hud-top">
        <span className="hud-brand">
          Agent<span>Commander</span>
        </span>
        <span className={connected ? 'hud-pill hud-live' : 'hud-pill hud-dead'}>
          {connected ? '● 연결됨' : '○ 연결 끊김'}
        </span>
        <span className="hud-spacer" />
        <span className="hud-pill">에이전트 {list.length}</span>
      </header>

      <div className="hud hud-bottom">
        {SUMMARY_ORDER.filter((s) => counts[s]).map((s) => (
          <span key={s} className="hud-count">
            <i style={{ background: STATE_COLOR[s] }} />
            {s} {counts[s]}
          </span>
        ))}
        {list.length === 0 && (
          <span className="hud-empty">
            수신된 에이전트가 없습니다. 백엔드가 실행 중인지 확인하세요.
          </span>
        )}
      </div>
    </main>
  )
}

// TODO(Phase 3): AgentCube → AgentCharacter(리깅 glTF)로 교체.
//   교체 전에 큐브 20개 동시 렌더링 성능을 먼저 측정한다 (명세 10.1절).
//   backend/.env 의 MOCK_AGENT_COUNT 를 20으로 올리면 바로 확인할 수 있다.
