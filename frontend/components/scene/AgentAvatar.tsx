'use client'

/**
 * 에이전트 한 명을 그린다 — 캐릭터가 있으면 캐릭터로, 없으면 큐브로.
 *
 * Phase 3의 교체 지점이다. 역할에 등록된 glTF가 있으면 AgentCharacter를,
 * 아직 없거나 로딩에 실패하면 AgentCube를 쓴다. 에셋 준비가 덜 된 상태에서도
 * 씬이 항상 뜨게 하려는 것이고, 역할별로 개별 판단하므로 셋 중 하나만
 * 준비돼도 그 역할만 캐릭터로 선다.
 */

import { Suspense } from 'react'
import type { Agent } from '@/lib/protocol'
import { AgentCharacter } from './AgentCharacter'
import { AgentCube } from './AgentCube'
import { ModelBoundary } from './ModelBoundary'

type Props = {
  agent: Agent
  /** 역할에 등록된 모델 경로. 없으면 큐브로 그린다 */
  modelPath?: string
  scatter: [number, number]
  speech?: string
  selected?: boolean
  onClick?: () => void
}

export function AgentAvatar({ agent, modelPath, ...rest }: Props) {
  const cube = <AgentCube agent={agent} {...rest} />

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
