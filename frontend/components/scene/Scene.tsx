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
import { useRoles } from '@/lib/useRoles'
import { AgentAvatar } from './AgentAvatar'
import { ZoneMarkers } from './ZoneMarkers'

/**
 * 같은 존에 모인 에이전트들이 겹치지 않도록 흩뿌린다.
 *
 * 배치는 목록 순서(index) 기반이다. agent_id 해시를 쓰면 서로 다른 id가
 * 비슷한 각도로 떨어져 큐브 두 개가 같은 자리에 겹치는 일이 생긴다 —
 * 실제로 running 존에서 z-fighting이 났다.
 *
 * 황금각(≈137.5°)으로 돌리면 몇 개를 배치하든 이웃과 각도가 최대한 벌어진다.
 * 해바라기 씨앗 배열과 같은 원리다. 반지름도 √n으로 늘려 밀도를 고르게 한다.
 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
/** 캐릭터 어깨너비를 감안한 최소 간격. 큐브(한 변 0.9)에도 넉넉하다 */
const SCATTER_BASE = 0.8

function scatterFor(index: number): [number, number] {
  const angle = index * GOLDEN_ANGLE
  const radius = SCATTER_BASE * Math.sqrt(index + 0.5)
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
  // role_id → model_path. 등록된 모델이 없으면 해당 역할은 큐브로 그려진다.
  const roles = useRoles()

  // 흩뿌리기는 **존별로** 계산한다.
  //
  // 전체 목록 순번으로 계산하면 같은 존에 모인 에이전트들이 서로 겹친다 —
  // 순번이 1,4,7 처럼 띄엄띄엄이면 각도가 제각각이라 간격이 보장되지 않는다.
  // 존 안에서 0,1,2 로 다시 세면 황금각 배치가 제 역할을 한다.
  //
  // 존은 상태가 아니라 좌표로 나눈다. running 과 retrying 이 같은 존을
  // 쓰기 때문이다 (명세 5.1절).
  const scatters = useMemo(() => {
    const byZone = new Map<string, Agent[]>()
    agents.forEach((a) => {
      const key = a.position.join(',')
      const group = byZone.get(key)
      if (group) group.push(a)
      else byZone.set(key, [a])
    })

    const map: Record<string, [number, number]> = {}
    byZone.forEach((group) => {
      // agent_id 정렬로 자리를 고정한다. 안 하면 목록 순서가 바뀔 때마다
      // 캐릭터들이 존 안에서 자리를 맞바꾼다.
      group
        .sort((a, b) => a.agent_id.localeCompare(b.agent_id))
        .forEach((a, i) => (map[a.agent_id] = scatterFor(i)))
    })
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
        <AgentAvatar
          key={agent.agent_id}
          agent={agent}
          modelPath={roles[agent.role]}
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
