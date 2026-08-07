'use client'

/**
 * 3D 씬 (명세 7장 Phase 2).
 *
 * 렌더링과 상태 관리를 분리한다 — 이 컴포넌트는 에이전트 배열만 받고
 * WebSocket을 모른다. Phase 3에서 큐브를 캐릭터로 갈아끼울 때 useAgents는
 * 건드리지 않아야 한다 (2.2절).
 */

import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { MOUSE } from 'three'
import { useMemo, useRef } from 'react'
import type { Agent } from '@/lib/protocol'
import { useAvatarMode } from '@/lib/avatarMode'
import { useRoles } from '@/lib/useRoles'
import { zoneCell } from '@/lib/zoneLayout'
import { AgentAvatar } from './AgentAvatar'
import { CameraRig, HOME_POSITION, HOME_TARGET } from './CameraRig'
import { TileFloor } from './TileFloor'
import { ZoneMarkers } from './ZoneMarkers'

/** 이 픽셀 이내로 움직였으면 드래그가 아니라 클릭으로 본다 */
const CLICK_SLOP = 5
/**
 * 한 존에 이 수를 넘게 모이면 이름표를 접는다.
 *
 * 격자로 세워도 이름표는 캐릭터보다 넓어서 옆자리와 겹친다. 다섯 명까지는
 * 읽히지만 그 위로는 글자가 서로 파고들어 아무것도 읽히지 않는다.
 */
const DENSE_THRESHOLD = 5
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
  // 캐릭터 표현 방식 (?avatar=sprite|character|cube)
  const { mode } = useAvatarMode()
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
  const { scatters, dense } = useMemo(() => {
    const byZone = new Map<string, Agent[]>()
    agents.forEach((a) => {
      const key = a.position.join(',')
      const group = byZone.get(key)
      if (group) group.push(a)
      else byZone.set(key, [a])
    })

    const map: Record<string, [number, number]> = {}
    const crowded: Record<string, boolean> = {}
    byZone.forEach((group) => {
      // agent_id 정렬로 자리를 고정한다. 안 하면 목록 순서가 바뀔 때마다
      // 캐릭터들이 존 안에서 자리를 맞바꾼다.
      group
        .sort((a, b) => a.agent_id.localeCompare(b.agent_id))
        .forEach((a, i) => {
          map[a.agent_id] = zoneCell(i, group.length)
          crowded[a.agent_id] = group.length > DENSE_THRESHOLD
        })
    })
    return { scatters: map, dense: crowded }
  }, [agents])

  // 고른 캐릭터가 실제로 서 있는 자리 — 존 좌표에 격자 오프셋을 더한 값이다
  const focus = useMemo(() => {
    if (!selectedId) return null
    const target = agents.find((a) => a.agent_id === selectedId)
    if (!target) return null
    const [ox, oz] = scatters[selectedId] ?? [0, 0]
    const [x, y, z] = target.position
    return [x + ox, y, z + oz] as [number, number, number]
  }, [selectedId, agents, scatters])

  return (
    <Canvas
      shadows
      // 존이 x∈[-12,12], z∈[-12,9] 에 퍼져 있어 전체가 한눈에 들어올 거리.
      //
      // 화각을 좁히고 그만큼 다가섰다. 45°에서는 원근 왜곡이 커서 가장자리
      // 캐릭터가 기울어 보였는데, 도트는 평면이라 이 왜곡이 더 눈에 띈다.
      // 좁은 화각은 화면을 납작하게 만들어 2D 도트와 결이 맞는다.
      camera={{ position: HOME_POSITION, fov: 38 }}
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

      <TileFloor />

      <ZoneMarkers />

      {agents.map((agent) => (
        <AgentAvatar
          key={agent.agent_id}
          agent={agent}
          mode={mode}
          modelPath={roles[agent.role]}
          scatter={scatters[agent.agent_id] ?? [0, 0]}
          speech={speech[agent.agent_id]}
          selected={selectedId === agent.agent_id}
          dense={dense[agent.agent_id]}
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
        target={HOME_TARGET}
        mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN }}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.15}
        minDistance={6}
        maxDistance={62}
      />

      {/* OrbitControls 뒤에 둔다 — 이 장치가 컨트롤을 잡아 움직이기 때문이다 */}
      <CameraRig focus={focus} focusId={selectedId} />
    </Canvas>
  )
}
