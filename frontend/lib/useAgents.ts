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

/**
 * 재연결 백오프 (밀리초).
 *
 * 명세 11.2절이 재시도에 지수 백오프(1s→2s→4s)를 쓰기로 한 것과 같은 방식이다.
 * 다만 여기는 사람이 화면을 보고 있는 상황이라 상한을 30초로 둔다 — 그 이상
 * 기다리게 하면 "죽은 화면"으로 보인다.
 */
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000]

function backoffFor(attempt: number): number {
  return BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]
}

export type ConnectionState = {
  connected: boolean
  /** 연속 실패 횟수. 0이면 아직 끊긴 적 없음 */
  attempt: number
  /** 다음 재시도까지 남은 초. 연결됐거나 시도 중이면 null */
  retryInSeconds: number | null
}

export function useAgents() {
  const [agents, setAgents] = useState<Record<string, Agent>>({})
  const [speech, setSpeech] = useState<Record<string, string>>({})
  const [connection, setConnection] = useState<ConnectionState>({
    connected: false,
    attempt: 0,
    retryInSeconds: null,
  })

  const wsRef = useRef<WebSocket | null>(null)
  const attemptRef = useRef(0)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const speechTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const closedByUsRef = useRef(false)
  /** 즉시 재연결을 트리거하기 위한 핸들 — "지금 시도" 버튼이 쓴다 */
  const connectRef = useRef<() => void>(() => {})

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }, [])

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000/ws'

    const scheduleReconnect = () => {
      const delay = backoffFor(attemptRef.current)
      attemptRef.current += 1

      let remaining = Math.round(delay / 1000)
      setConnection({ connected: false, attempt: attemptRef.current, retryInSeconds: remaining })

      // 남은 시간을 1초 단위로 보여준다 — 언제 다시 붙는지 알 수 없으면
      // 사용자는 새로고침부터 누른다
      const tick = setInterval(() => {
        remaining -= 1
        setConnection((prev) =>
          prev.connected ? prev : { ...prev, retryInSeconds: Math.max(0, remaining) },
        )
      }, 1000)

      const timer = setTimeout(() => {
        clearInterval(tick)
        connect()
      }, delay)

      timersRef.current.push(timer, tick as unknown as ReturnType<typeof setTimeout>)
    }

    const connect = () => {
      clearTimers()
      setConnection((prev) => ({ ...prev, retryInSeconds: null }))

      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        attemptRef.current = 0
        setConnection({ connected: true, attempt: 0, retryInSeconds: null })
      }

      ws.onclose = () => {
        if (closedByUsRef.current) return
        scheduleReconnect()
      }

      // onerror 뒤에는 항상 onclose가 오므로 여기서 따로 재연결하지 않는다.
      // 두 곳에서 예약하면 백오프가 두 배로 빨라진다.
      ws.onerror = () => {}

      ws.onmessage = (e) => {
        const msg: ServerMessage = JSON.parse(e.data)
        switch (msg.type) {
          case 'agent_snapshot': {
            // 재연결 시 서버가 스냅샷을 다시 보내주므로 정합성은 자동 회복된다
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
            const t = setTimeout(() => {
              setSpeech((prev) => {
                const next = { ...prev }
                delete next[agent_id]
                return next
              })
            }, SPEECH_TTL_MS)
            speechTimersRef.current.push(t)
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
    }

    connectRef.current = () => {
      attemptRef.current = 0
      wsRef.current?.close()
      connect()
    }

    closedByUsRef.current = false
    connect()

    const speechTimers = speechTimersRef.current
    return () => {
      closedByUsRef.current = true
      clearTimers()
      speechTimers.forEach(clearTimeout)
      speechTimers.length = 0
      wsRef.current?.close()
    }
  }, [clearTimers])

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }, [])

  const clickAgent = useCallback(
    (agentId: string) => send({ type: 'agent_click', payload: { agent_id: agentId } }),
    [send],
  )

  /** "지금 시도" — 백오프를 기다리지 않고 즉시 재연결 */
  const reconnectNow = useCallback(() => connectRef.current(), [])

  return {
    agents,
    speech,
    connected: connection.connected,
    connection,
    clickAgent,
    reconnectNow,
  }
}
