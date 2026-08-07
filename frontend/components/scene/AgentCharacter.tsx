'use client'

/**
 * 리깅 캐릭터 (명세 6.4 / 5.1절, Phase 3).
 *
 * 역할(role)별로 다른 glTF를 로드하고, 상태가 바뀌면 애니메이션을 교차
 * 전환한다. 이동 보간과 클릭 처리는 큐브 스텁(AgentCube)과 동일한 규칙을
 * 따르므로, 둘을 바꿔 끼워도 상호작용 코드는 그대로다.
 *
 * 에셋이 프로젝트마다 제각각이라 두 가지를 자동으로 흡수한다:
 *
 *  1. 클립 이름 — 명세의 'Idle' / 'Working' 같은 이름은 예시값이다. 실제
 *     Mixamo·Quaternius·KayKit 클립 이름은 다 다르므로, 이름을 그대로
 *     찾지 못하면 부분 일치 → 첫 클립 순으로 물러난다.
 *  2. 모델 크기 — 팩마다 단위가 달라 어떤 건 0.02, 어떤 건 100으로 나온다.
 *     바운딩 박스를 재서 목표 높이에 맞춘다.
 */

import { Html, useAnimations, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { AnimationClip, Bone, Group, Object3D } from 'three'
import { Box3, MathUtils, Vector3 } from 'three'
// three는 SkeletonUtils를 객체가 아니라 명명 export로 내보낸다
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { modelUrl } from '@/lib/models'
import type { Agent, AgentState } from '@/lib/protocol'
import { STATE_CLIP, STATE_COLOR } from '@/lib/protocol'
import { DialogueBubble } from './DialogueBubble'

const LERP_SPEED = 2.4
/** 캐릭터 목표 높이(월드 단위). 큐브 한 변 0.9와 어울리는 크기 */
const TARGET_HEIGHT = 1.6
/** 클립 전환 시간 — 급격한 포즈 전환(pop)을 막는다 */
const FADE_SECONDS = 0.3

/** 에셋이 예상 밖일 때 화면이 통째로 깨지지 않도록 상식 범위로 묶는다 */
function clampScale(scale: number): number {
  return Math.min(Math.max(scale, 0.01), 100)
}

/**
 * 원하는 클립 이름을 실제 에셋의 클립 목록에 맞춰 해석한다.
 * 정확히 없으면 부분 일치, 그것도 없으면 첫 클립으로 물러난다.
 */
function resolveClip(available: string[], desired: string): string | undefined {
  if (available.length === 0) return undefined
  const lower = desired.toLowerCase()

  const exact = available.find((n) => n.toLowerCase() === lower)
  if (exact) return exact

  const partial = available.find(
    (n) => n.toLowerCase().includes(lower) || lower.includes(n.toLowerCase()),
  )
  if (partial) return partial

  return available[0]
}

type Props = {
  agent: Agent
  /** roles.model_path — '/models/researcher.glb' 형태 */
  modelPath: string
  scatter: [number, number]
  speech?: string
  selected?: boolean
  onClick?: () => void
}

export function AgentCharacter({
  agent,
  modelPath,
  scatter,
  speech,
  selected,
  onClick,
}: Props) {
  const group = useRef<Group>(null)
  const { scene, animations } = useGLTF(modelUrl(modelPath))

  // 여러 에이전트가 같은 glb를 쓰므로 인스턴스마다 복제해야 한다.
  // 스킨드 메시는 일반 clone()으로는 뼈대 참조가 깨지므로 SkeletonUtils를 쓴다.
  const model = useMemo(() => cloneSkinned(scene) as Object3D, [scene])

  // 팩마다 단위가 달라 실제 크기를 재서 맞춘다.
  //
  // ⚠️ Box3.setFromObject 로 재면 안 된다. 스킨드 메시는 뼈대가 형태를 만드는데
  //    Box3는 "지오메트리 × 노드 행렬"만 보고, 그 값이 SkeletonUtils.clone 전후로
  //    달라진다. 원본으로 재면 1.80(정상)인데 복제본으로 재면 훨씬 작게 나와
  //    배율이 90배까지 뛰고 캐릭터가 화면을 뒤덮었다.
  //
  //    뼈대의 월드 좌표는 복제해도 그대로라 이쪽이 안정적이다. Mixamo 모델은
  //    원점이 발밑에 있으므로, 최상단 뼈의 높이가 곧 키다.
  const fitScale = useMemo(() => {
    model.updateWorldMatrix(true, true)

    const probe = new Vector3()
    let top = 0
    let bones = 0

    model.traverse((obj) => {
      if ((obj as Bone).isBone) {
        bones += 1
        obj.getWorldPosition(probe)
        top = Math.max(top, probe.y)
      }
    })

    // 뼈대가 없는 정적 메시는 바운딩 박스로 물러난다
    if (bones === 0) {
      const size = new Box3().setFromObject(model).getSize(new Vector3())
      return size.y > 1e-4 ? clampScale(TARGET_HEIGHT / size.y) : 1
    }

    return top > 1e-4 ? clampScale(TARGET_HEIGHT / top) : 1
  }, [model])

  const { actions } = useAnimations(animations as AnimationClip[], group)
  const clipNames = useMemo(() => animations.map((a) => a.name), [animations])
  const current = useRef<string | undefined>(undefined)

  // 상태 → 클립 전환 (crossfade)
  useEffect(() => {
    const desired = STATE_CLIP[agent.state as AgentState] ?? 'Idle'
    const next = resolveClip(clipNames, desired)
    if (!next || next === current.current) return

    if (current.current) actions[current.current]?.fadeOut(FADE_SECONDS)
    actions[next]?.reset().fadeIn(FADE_SECONDS).play()
    current.current = next
  }, [agent.state, actions, clipNames])

  useFrame((_, delta) => {
    if (!group.current) return
    const t = 1 - Math.exp(-LERP_SPEED * delta)
    const [tx, ty, tz] = agent.position
    const p = group.current.position
    p.x = MathUtils.lerp(p.x, tx + scatter[0], t)
    p.y = MathUtils.lerp(p.y, ty, t)
    p.z = MathUtils.lerp(p.z, tz + scatter[1], t)
  })

  const color = STATE_COLOR[agent.state]
  const isRetrying = agent.state === 'retrying'
  const isError = agent.state === 'error'

  return (
    <group ref={group}>
      <primitive
        object={model}
        scale={fitScale}
        onClick={(e: { stopPropagation: () => void }) => {
          e.stopPropagation()
          onClick?.()
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = 'auto')}
      />

      {/* 상태 색은 캐릭터 발밑 링으로 표시한다.
          모델 색을 물들이면 역할별 외형이 뭉개진다. */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, selected ? 0.62 : 0.52, 48]} />
        <meshBasicMaterial color={color} transparent opacity={selected ? 0.95 : 0.6} />
      </mesh>

      {(isRetrying || isError) && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.7, 0.78, 48]} />
          <meshBasicMaterial color={color} transparent opacity={0.4} />
        </mesh>
      )}

      {speech ? (
        <DialogueBubble
          text={speech}
          position={[0, TARGET_HEIGHT + 0.55, 0]}
          accent={isRetrying || isError ? color : undefined}
        />
      ) : (
        <Html
          position={[0, TARGET_HEIGHT + 0.35, 0]}
          center
          distanceFactor={11}
          pointerEvents="none"
        >
          <div className={selected ? 'nametag nametag-sel' : 'nametag'}>
            {agent.name}
            {isRetrying && ` · ${agent.retry_count}회차`}
          </div>
        </Html>
      )}
    </group>
  )
}
