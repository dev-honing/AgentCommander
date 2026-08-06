'use client'

/**
 * 3D 씬 (명세 7장 Phase 2).
 *
 * 렌더링과 상태 관리를 분리한다 — 이 컴포넌트는 에이전트 배열만 받고
 * WebSocket을 모른다. Phase 3에서 큐브를 캐릭터로 갈아끼울 때 useAgents는
 * 건드리지 않아야 한다 (2.2절).
 */

import { Canvas } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import { useMemo } from 'react'
import type { Agent } from '@/lib/protocol'
import { AgentCube } from './AgentCube'
import { ZoneMarkers } from './ZoneMarkers'

/**
 * 같은 존에 모인 에이전트들이 한 점에 겹치지 않도록 흩뿌린다.
 *
 * agent_id 기반의 결정적 배치라 상태가 바뀌어도 각자의 자리가 유지된다.
 * 무작위로 두면 갱신될 때마다 큐브가 존 안에서 튀어 다닌다.
 */
function scatterFor(agentId: string): [number, number] {
  let hash = 0
  for (let i = 0; i < agentId.length; i++) {
    hash = (hash * 31 + agentId.charCodeAt(i)) | 0
  }
  const angle = ((hash % 360) * Math.PI) / 180
  const radius = 0.45 + (Math.abs(hash >> 8) % 70) / 100 // 0.45 ~ 1.15
  return [Math.cos(angle) * radius, Math.sin(angle) * radius]
}

type SceneProps = {
  agents: Agent[]
  /** agent_id → 지금 말하고 있는 내용 */
  speech: Record<string, string>
  selectedId: string | null
  onSelect: (id: string) => void
  onDeselect: () => void
}

export function Scene({ agents, speech, selectedId, onSelect, onDeselect }: SceneProps) {
  const scatters = useMemo(() => {
    const map: Record<string, [number, number]> = {}
    agents.forEach((a) => (map[a.agent_id] = scatterFor(a.agent_id)))
    return map
  }, [agents])

  return (
    <Canvas shadows camera={{ position: [9, 8, 11], fov: 45 }} onPointerMissed={onDeselect}>
      <color attach="background" args={['#0b1020']} />
      <fog attach="fog" args={['#0b1020', 18, 42]} />

      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 12, 6]} intensity={1.1} castShadow />
      <directionalLight position={[-8, 5, -6]} intensity={0.3} color="#6f8cff" />

      <Grid
        args={[60, 60]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#1e2b4a"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#2f4a7a"
        fadeDistance={38}
        fadeStrength={1}
        infiniteGrid
      />

      <ZoneMarkers />

      {agents.map((agent) => (
        <AgentCube
          key={agent.agent_id}
          agent={agent}
          scatter={scatters[agent.agent_id] ?? [0, 0]}
          speech={speech[agent.agent_id]}
          selected={selectedId === agent.agent_id}
          onClick={() => onSelect(agent.agent_id)}
        />
      ))}

      <OrbitControls
        makeDefault
        enablePan={false}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.15}
        minDistance={6}
        maxDistance={30}
      />
    </Canvas>
  )
}
