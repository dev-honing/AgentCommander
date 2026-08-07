'use client'

/**
 * 도트 캐릭터 (게더타운 형식 시안).
 *
 * 3D 씬은 그대로 두고 캐릭터만 평면 스프라이트로 그린다. 존·이동 보간·클릭·
 * 말풍선·패널이 전부 3D 위에 얹혀 있어서, 캐릭터만 바꾸면 나머지는 그대로 산다.
 *
 * 리깅 캐릭터(AgentCharacter)와 같은 규칙을 따르므로 둘을 바꿔 끼워도
 * 상호작용 코드는 손대지 않는다.
 */

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group, Sprite as SpriteType } from 'three'
import { MathUtils } from 'three'
import { pixelCharacterFrames, SPRITE_H, SPRITE_W } from '@/lib/pixelCharacter'
import type { Agent } from '@/lib/protocol'
import { STATE_COLOR } from '@/lib/protocol'
import { TILE_WORLD } from '@/lib/tileTexture'
import { DialogueBubble } from './DialogueBubble'
import { Nametag } from './Nametag'

const LERP_SPEED = 2.4
/**
 * 캐릭터 크기는 타일에 맞춘다 — 폭이 정확히 한 칸.
 *
 * 임의의 키를 정하면 타일 눈금과 어긋나 캐릭터가 바닥에 얹혀 보인다.
 * 타일을 기준으로 잡으면 카메라를 어떻게 움직여도 비율이 유지된다.
 */
const WIDTH = TILE_WORLD
const HEIGHT = WIDTH * (SPRITE_H / SPRITE_W)

/** 프레임 전환 간격(초). 상태에 따라 달라진다 */
const FRAME_INTERVAL: Record<string, number> = {
  idle: 0.9,
  running: 0.22,
  waiting: 0.6,
  retrying: 0.18,
  error: 1.2,
  done: 0.3,
}

type Props = {
  agent: Agent
  scatter: [number, number]
  speech?: string
  selected?: boolean
  onClick?: () => void
}

export function AgentSprite({ agent, scatter, speech, selected, onClick }: Props) {
  const group = useRef<Group>(null)
  const sprite = useRef<SpriteType>(null)
  const elapsed = useRef(0)
  const frame = useRef(0)

  const frames = useMemo(() => pixelCharacterFrames(agent.role), [agent.role])

  const color = STATE_COLOR[agent.state]
  const isRetrying = agent.state === 'retrying'
  const isError = agent.state === 'error'
  const busy = agent.state === 'running' || isRetrying

  useFrame((_, delta) => {
    const t = 1 - Math.exp(-LERP_SPEED * delta)
    elapsed.current += delta

    if (group.current) {
      const [tx, ty, tz] = agent.position
      const p = group.current.position
      p.x = MathUtils.lerp(p.x, tx + scatter[0], t)
      p.y = MathUtils.lerp(p.y, ty, t)
      p.z = MathUtils.lerp(p.z, tz + scatter[1], t)
    }

    if (sprite.current) {
      // 프레임 교체 — 상태가 바쁠수록 빠르게 움직인다
      const interval = FRAME_INTERVAL[agent.state] ?? 0.6
      const next = Math.floor(elapsed.current / interval) % frames.length
      if (next !== frame.current) {
        frame.current = next
        sprite.current.material.map = frames[next]
        sprite.current.material.needsUpdate = true
      }

      // 일하는 중에는 살짝 들썩이게 한다. 도트는 움직임이 없으면 정지 화면처럼 보인다.
      const bob = busy ? Math.sin(elapsed.current * 7) * 0.035 : 0
      sprite.current.position.y = HEIGHT / 2 + bob
    }
  })

  return (
    <group ref={group}>
      <sprite
        ref={sprite}
        position={[0, HEIGHT / 2, 0]}
        scale={[WIDTH, HEIGHT, 1]}
        onClick={(e) => {
          e.stopPropagation()
          onClick?.()
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = 'auto')}
      >
        <spriteMaterial
          map={frames[0]}
          transparent
          // 도트가 원근에 따라 흐려지지 않게 한다
          toneMapped={false}
          depthWrite={false}
        />
      </sprite>

      {/* 발밑 그림자.
          스프라이트는 빛을 받지 않아 그림자가 생기지 않는다. 그림자가 없으면
          바닥에 서 있는지 떠 있는지 구분이 안 되므로 직접 깔아 준다. */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[WIDTH * 0.3, 20]} />
        <meshBasicMaterial color="#05080f" transparent opacity={0.45} />
      </mesh>

      {/* 상태는 발밑 링으로 표시한다. 옷 색을 물들이면 역할 구분이 사라진다. */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.34, selected ? 0.52 : 0.44, 32]} />
        <meshBasicMaterial color={color} transparent opacity={selected ? 0.95 : 0.6} />
      </mesh>

      {(isRetrying || isError) && (
        <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.6, 0.68, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.4} />
        </mesh>
      )}

      {speech ? (
        <DialogueBubble
          text={speech}
          position={[0, HEIGHT + 0.5, 0]}
          accent={isRetrying || isError ? color : undefined}
        />
      ) : (
        <Nametag agent={agent} y={HEIGHT + 0.3} selected={selected} />
      )}
    </group>
  )
}
