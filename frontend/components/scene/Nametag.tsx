'use client'

/**
 * 캐릭터 머리 위 이름표.
 *
 * 큐브 스텁과 리깅 캐릭터가 같은 표시를 쓰도록 분리했다. 한쪽만 고쳐서
 * 둘이 어긋나는 일을 막는다.
 *
 * 실행에 속한 에이전트는 이름 앞에 실행 색 점을 붙인다. 3D에서도 "어느
 * 질문에서 나온 것인지" 구분되어야 목록과 씬이 같은 이야기를 한다.
 */

import { Html } from '@react-three/drei'
import type { Agent } from '@/lib/protocol'
import { runColor } from '@/lib/runColor'
import { Z_NAMETAG } from './overlayDepth'

type Props = {
  agent: Agent
  /** 머리 위 높이 */
  y: number
  selected?: boolean
}

export function Nametag({ agent, y, selected }: Props) {
  const run = agent.parent_id ? runColor(agent.parent_id) : null

  return (
    <Html
      position={[0, y, 0]}
      center
      distanceFactor={11}
      pointerEvents="none"
      zIndexRange={Z_NAMETAG}
    >
      <div className={selected ? 'nametag nametag-sel' : 'nametag'}>
        {run && <i className="nametag-run" style={{ background: run }} />}
        {agent.name}
        {agent.state === 'retrying' && ` · ${agent.retry_count}회차`}
      </div>
    </Html>
  )
}
