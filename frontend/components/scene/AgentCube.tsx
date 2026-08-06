'use client'

/**
 * 큐브 스텁 (명세 7장 Phase 2).
 *
 * Phase 3에서 AgentCharacter(리깅 glTF)로 교체될 자리표시다. 캐릭터를 바로
 * 붙이지 않는 이유는 10.1절의 권고 때문이다 — 병목이 캐릭터 렌더링일
 * 가능성이 높으므로, 큐브 상태에서 20개 동시 렌더링 성능을 먼저 재 본다.
 *
 * 이동 보간은 여기서 처리한다. 서버는 상태가 바뀔 때 목표 좌표만 내려주고,
 * 매 프레임 좌표를 보내지 않는다 (5.1절).
 */

import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group, MeshStandardMaterial } from 'three'
import { Color, MathUtils } from 'three'
import type { Agent } from '@/lib/protocol'
import { STATE_COLOR } from '@/lib/protocol'

/** 목표 지점에 도달하는 속도. 값이 클수록 빠르게 붙는다. */
const LERP_SPEED = 2.4

type Props = {
  agent: Agent
  /** 같은 존에 여러 에이전트가 겹치지 않도록 흩뿌리는 오프셋 */
  scatter: [number, number]
  onClick?: () => void
}

export function AgentCube({ agent, scatter, onClick }: Props) {
  const group = useRef<Group>(null)
  const material = useRef<MeshStandardMaterial>(null)
  // 매 프레임 새 Color를 만들지 않도록 재사용 인스턴스를 들고 있는다
  const targetColor = useRef(new Color())

  useFrame((_, delta) => {
    // 프레임레이트에 무관한 감쇠 — 60fps와 144fps에서 같은 속도로 움직인다
    const t = 1 - Math.exp(-LERP_SPEED * delta)

    if (group.current) {
      const [tx, ty, tz] = agent.position
      const p = group.current.position
      p.x = MathUtils.lerp(p.x, tx + scatter[0], t)
      p.y = MathUtils.lerp(p.y, ty + 0.5, t)
      p.z = MathUtils.lerp(p.z, tz + scatter[1], t)
    }

    if (material.current) {
      // 색도 툭 끊기지 않게 섞는다. Phase 3의 애니메이션 crossfade와 같은 의도다.
      targetColor.current.set(STATE_COLOR[agent.state])
      material.current.color.lerp(targetColor.current, t)
      material.current.emissive.lerp(targetColor.current, t)
    }
  })

  return (
    <group ref={group} onClick={onClick}>
      <mesh castShadow>
        <boxGeometry args={[0.9, 0.9, 0.9]} />
        <meshStandardMaterial
          ref={material}
          color={STATE_COLOR[agent.state]}
          emissive={STATE_COLOR[agent.state]}
          emissiveIntensity={0.35}
          roughness={0.45}
          metalness={0.1}
        />
      </mesh>

      <Html position={[0, 1.05, 0]} center distanceFactor={11} pointerEvents="none">
        <div className="nametag">
          {agent.name}
          {agent.state === 'retrying' && ` · ${agent.retry_count}회차`}
        </div>
      </Html>
    </group>
  )
}
