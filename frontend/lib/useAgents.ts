'use client'

/**
 * WebSocket 상태 훅 (명세 6.3절).
 *
 * 3D 렌더링과 상태 관리를 분리한다 — 캐릭터 모델 교체나 씬 변경이 상태 로직에
 * 영향을 주지 않아야 한다 (2.2절).
 *
 * ⚠️ 20개 에이전트가 잦은 빈도로 갱신되면 리렌더링이 병목이 된다.
 *    상태를 agent_id 단위 Map(Record)으로 관리해, 갱신된 에이전트의 컴포넌트만
 *    다시 그려지도록 구조화한다 (4장 주의사항).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Agent, ClientMessage, ServerMessage } from './protocol'

const SPEECH_TTL_MS = 4000

export function useAgents() {
  const [agents, setAgents] = useState<Record<string, Agent>>({})
  const [speech, setSpeech] = useState<Record<string, string>>({})
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000/ws'
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)

    ws.onmessage = (e) => {
      const msg: ServerMessage = JSON.parse(e.data)
      switch (msg.type) {
        case 'agent_snapshot': {
          const map: Record<string, Agent> = {}
          msg.payload.forEach((a) => (map[a.agent_id] = a))
          setAgents(map)
          break
        }
        case 'agent_update':
          setAgents((prev) => ({ ...prev, [msg.payload.agent_id]: msg.payload }))
          break
        case 'agent_speak': {
          const { agent_id, text } = msg.payload
          setSpeech((prev) => ({ ...prev, [agent_id]: text }))
          setTimeout(() => {
            setSpeech((prev) => {
              const next = { ...prev }
              delete next[agent_id]
              return next
            })
          }, SPEECH_TTL_MS)
          break
        }
        case 'agent_removed':
          setAgents((prev) => {
            const next = { ...prev }
            delete next[msg.payload.agent_id]
            return next
          })
          break
      }
    }

    return () => ws.close()
  }, [])

  const send = useCallback((msg: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(msg))
  }, [])

  const clickAgent = useCallback(
    (agentId: string) => send({ type: 'agent_click', payload: { agent_id: agentId } }),
    [send],
  )

  return { agents, speech, connected, clickAgent }
}

// TODO(Phase 7a 이전): 재연결 로직 추가.
//   현재는 연결이 끊기면 끝이다. Tunnel/AWS 환경에서는 끊김이 일상적이므로
//   지수 백오프 재연결이 필요하다. 재연결 시 서버가 agent_snapshot을 다시
//   보내주므로 상태 정합성은 자동으로 회복된다.
