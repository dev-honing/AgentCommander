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
import { MOUSE } from 'three'
import { useMemo, useRef } from 'react'
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
/** 이 픽셀 이내로 움직였으면 드래그가 아니라 클릭으로 본다 */
const CLICK_SLOP = 5
/** 존 다섯 개의 대략적인 중심. 카메라가 이 지점을 본다 */
const ORBIT_TARGET: [number, number, number] = [2.5, 0, -1]

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
  /** 마지막 pointerdown 위치 — 드래그와 클릭을 가르는 데 쓴다 */
  const pressAt = useRef<[number, number] | null>(null)

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
    <Canvas
      shadows
      // 존이 x∈[-12,12], z∈[-12,9] 에 퍼져 있어 전체가 한눈에 들어올 거리
      camera={{ position: [22, 21, 30], fov: 45 }}
      // 시점을 회전하다 빈 공간에서 손을 떼도 click 이 발생한다. 그대로 두면
      // 카메라를 돌릴 때마다 선택이 풀리므로, 거의 움직이지 않은 경우만
      // "빈 곳을 눌렀다"로 본다.
      onPointerDown={(e) => {
        pressAt.current = [e.clientX, e.clientY]
      }}
      onPointerMissed={(e) => {
        const from = pressAt.current
        if (!from) return
        const moved = Math.hypot(e.clientX - from[0], e.clientY - from[1])
        if (moved < CLICK_SLOP) onDeselect()
      }}
    >
      <color attach="background" args={['#0b1020']} />
      <fog attach="fog" args={['#0b1020', 45, 110]} />

      <ambientLight intensity={0.55} />
      <directionalLight position={[14, 24, 14]} intensity={1.1} castShadow />
      <directionalLight position={[-18, 10, -14]} intensity={0.3} color="#6f8cff" />

      <Grid
        args={[120, 120]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#1e2b4a"
        sectionSize={6}
        sectionThickness={1}
        sectionColor="#2f4a7a"
        fadeDistance={95}
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

      {/* 마우스 조작
            휠         — 확대/축소
            휠 드래그  — 화면 이동 (기본값은 dolly 라 바꿔야 한다)
            좌 드래그  — 시점 회전
            우 드래그  — 화면 이동 (편의상 함께 열어 둔다) */}
      <OrbitControls
        makeDefault
        enablePan
        // 원점이 아니라 존 다섯 개의 중심을 본다. 원점을 보면 waiting(12,0,9)이
        // 화면 아래로 밀려 입력창에 가린다.
        target={ORBIT_TARGET}
        mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN }}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.15}
        minDistance={8}
        maxDistance={70}
      />
    </Canvas>
  )
}
