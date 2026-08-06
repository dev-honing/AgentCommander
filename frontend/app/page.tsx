'use client'

/**
 * 메인 화면.
 *
 * Phase 2에서 <Canvas>로 교체된다. 지금은 WebSocket 배관이 살아 있는지만
 * 텍스트로 확인하는 Phase 0용 화면이다 — "더미 상태가 2초마다 프론트에
 * 도달"하는 것이 Phase 0의 완료 기준이다 (명세 7장).
 */

import { useAgents } from '@/lib/useAgents'
import { STATE_COLOR } from '@/lib/protocol'

export default function Home() {
  const { agents, connected } = useAgents()
  const list = Object.values(agents)

  return (
    <main style={{ padding: 32 }}>
      <h1 style={{ margin: 0, fontSize: 24 }}>AgentCommander</h1>
      <p style={{ color: connected ? '#22c55e' : '#ef4444', fontSize: 14 }}>
        {connected ? '● WebSocket 연결됨' : '○ 연결 끊김'}
      </p>

      {list.length === 0 ? (
        <p style={{ color: '#94a3b8', fontSize: 14 }}>
          수신된 에이전트가 없습니다. 백엔드가 실행 중인지 확인하세요.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {list.map((agent) => (
            <li key={agent.agent_id} style={{ padding: '8px 0' }}>
              <span style={{ color: STATE_COLOR[agent.state] }}>●</span>{' '}
              <strong>{agent.name}</strong>{' '}
              <span style={{ color: '#94a3b8' }}>
                {agent.state}
                {agent.state === 'retrying' && ` (${agent.retry_count}회차)`}
                {' · '}
                {Math.round(agent.progress * 100)}%
              </span>
              {agent.message && (
                <div style={{ color: '#64748b', fontSize: 13 }}>{agent.message}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

// TODO(Phase 2): <Canvas>로 교체하고 AgentCube 스텁 20개 렌더링 성능 측정.
//   리깅 캐릭터로 넘어가기(Phase 3) 전에 큐브 상태에서 먼저 측정하라는 것이
//   명세 10.1절의 권고다.
