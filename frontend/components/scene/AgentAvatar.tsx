'use client'

/**
 * 에이전트 한 명을 그린다 — 어떤 표현으로 그릴지 여기서 고른다.
 *
 * 에셋 방향을 정하는 중이라 세 가지가 공존한다. 이 파일이 유일한 분기점이라,
 * 표현을 바꿔도 씬·존·클릭·말풍선·패널은 손대지 않는다.
 *
 *   sprite    도트 캐릭터 (기본)
 *   character 리깅 glTF — 역할에 등록된 모델이 있을 때만, 없거나 실패하면 큐브
 *   cube      큐브 스텁
 */

import { Suspense } from 'react'
import type { AvatarMode } from '@/lib/avatarMode'
import type { Agent } from '@/lib/protocol'
import { AgentCharacter } from './AgentCharacter'
import { AgentCube } from './AgentCube'
import { AgentSprite } from './AgentSprite'
import { ModelBoundary } from './ModelBoundary'

type Props = {
  agent: Agent
  mode: AvatarMode
  /** 역할에 등록된 모델 경로. 없으면 캐릭터 모드여도 큐브로 그린다 */
  modelPath?: string
  scatter: [number, number]
  speech?: string
  selected?: boolean
  /** 같은 존이 붐빌 때 참 — 이름표를 접는다 */
  dense?: boolean
  onClick?: () => void
}

export function AgentAvatar({ agent, mode, modelPath, ...rest }: Props) {
  const cube = <AgentCube agent={agent} {...rest} />

  if (mode === 'cube') return cube
  if (mode === 'sprite') return <AgentSprite agent={agent} {...rest} />

  // character 모드 — 모델이 없으면 큐브로 물러난다
  if (!modelPath) return cube

  return (
    <ModelBoundary fallback={cube} resetKey={modelPath}>
      {/* 로딩 중에도 자리를 지키도록 큐브를 fallback 으로 둔다 */}
      <Suspense fallback={cube}>
        <AgentCharacter agent={agent} modelPath={modelPath} {...rest} />
      </Suspense>
    </ModelBoundary>
  )
}
