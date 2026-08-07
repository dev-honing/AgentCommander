'use client'

/**
 * 큐브 스텁 (명세 7장 Phase 2) + 클릭 상호작용 (Phase 4).
 *
 * Phase 3에서 AgentCharacter(리깅 glTF)로 교체될 자리표시다. 캐릭터를 바로
 * 붙이지 않는 이유는 10.1절의 권고 때문이다 — 병목이 캐릭터 렌더링일
 * 가능성이 높으므로, 큐브 상태에서 20개 동시 렌더링 성능을 먼저 재 본다.
 *
 * 이동 보간은 여기서 처리한다. 서버는 상태가 바뀔 때 목표 좌표만 내려주고,
 * 매 프레임 좌표를 보내지 않는다 (5.1절).
 */


import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three'
import { Color, MathUtils } from 'three'
import type { Agent } from '@/lib/protocol'
import { STATE_COLOR } from '@/lib/protocol'
import { DialogueBubble } from './DialogueBubble'
import { Nametag } from './Nametag'

/** 목표 지점에 도달하는 속도. 값이 클수록 빠르게 붙는다. */
const LERP_SPEED = 2.4
/** 큐브 중심에서 바닥까지의 거리 — 링을 바닥에 눕히는 데 쓴다 */
const FLOOR_OFFSET = -0.49

type Props = {
  agent: Agent
  /** 같은 존에 여러 에이전트가 겹치지 않도록 흩뿌리는 오프셋 */
  scatter: [number, number]
  /** 지금 말하고 있는 내용 (agent_speak 수신 시) */
  speech?: string
  selected?: boolean
  onClick?: () => void
}

export function AgentCube({ agent, scatter, speech, selected, onClick }: Props) {
  const group = useRef<Group>(null)
  const material = useRef<MeshStandardMaterial>(null)
  const pulse = useRef<Mesh>(null)
  const pulseMat = useRef<MeshBasicMaterial>(null)
  // 매 프레임 새 Color를 만들지 않도록 재사용 인스턴스를 들고 있는다
  const targetColor = useRef(new Color())
  const elapsed = useRef(0)

  const isRetrying = agent.state === 'retrying'
  const isError = agent.state === 'error'
  const color = STATE_COLOR[agent.state]

  useFrame((_, delta) => {
    // 프레임레이트에 무관한 감쇠 — 60fps와 144fps에서 같은 속도로 움직인다
    const t = 1 - Math.exp(-LERP_SPEED * delta)
    elapsed.current += delta

    if (group.current) {
      const [tx, ty, tz] = agent.position
      const p = group.current.position
      p.x = MathUtils.lerp(p.x, tx + scatter[0], t)
      p.y = MathUtils.lerp(p.y, ty + 0.5, t)
      p.z = MathUtils.lerp(p.z, tz + scatter[1], t)
    }

    if (material.current) {
      // 색도 툭 끊기지 않게 섞는다. Phase 3의 애니메이션 crossfade와 같은 의도다.
      targetColor.current.set(color)
      material.current.color.lerp(targetColor.current, t)
      material.current.emissive.lerp(targetColor.current, t)
    }

    // 재시도/실패는 퍼져 나가는 링으로 구분한다.
    // 존 좌표가 running과 같기 때문에(5.1절) 위치가 아니라 연출로만 갈린다.
    if (pulse.current && pulseMat.current) {
      if (isRetrying || isError) {
        const phase = (elapsed.current % 1.6) / 1.6
        const scale = 1 + phase * 1.6
        pulse.current.scale.set(scale, scale, scale)
        pulse.current.visible = true
        pulseMat.current.opacity = (1 - phase) * 0.55
      } else {
        pulse.current.visible = false
      }
    }
  })

  return (
    <group ref={group}>
      <mesh
        castShadow
        onClick={(e) => {
          // 뒤에 있는 큐브나 바닥까지 클릭이 전파되지 않게 막는다
          e.stopPropagation()
          onClick?.()
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = 'auto')}
      >
        <boxGeometry args={[0.9, 0.9, 0.9]} />
        <meshStandardMaterial
          ref={material}
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 0.7 : 0.35}
          roughness={0.45}
          metalness={0.1}
        />
      </mesh>

      {/* 선택 표시 — 바닥에 눕힌 링 */}
      {selected && (
        <mesh position={[0, FLOOR_OFFSET, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.72, 0.82, 48]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} />
        </mesh>
      )}

      {/* 재시도/실패 펄스 */}
      <mesh ref={pulse} position={[0, FLOOR_OFFSET, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.6, 0.68, 48]} />
        <meshBasicMaterial ref={pulseMat} color={color} transparent opacity={0.5} />
      </mesh>

      {/* 말풍선이 떠 있는 동안에는 이름표를 감춘다 — 겹쳐서 읽기 어려워진다 */}
      {speech ? (
        <DialogueBubble text={speech} accent={isRetrying || isError ? color : undefined} />
      ) : (
        <Nametag agent={agent} y={0.95} selected={selected} />
      )}
    </group>
  )
}
