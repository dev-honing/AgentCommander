'use client'

/**
 * 리깅 캐릭터 컴포넌트 (명세 6.4 / 5.1절) — Phase 3에서 구현.
 *
 * 구현 시 지켜야 할 것:
 *
 * 1. 역할(role)별로 다른 glTF를 로드한다. 경로는 반드시 lib/models.ts의
 *    modelUrl()로 조립한다 — 그냥 '/models/x.glb'를 쓰면 404다
 *    (docs/SPEC-NOTES.md 5번 항목).
 *
 * 2. 상태 전환 시 애니메이션은 crossfade한다. 급격한 포즈 전환(pop)을 막으려면
 *    useAnimations의 fadeOut/fadeIn을 쓴다 (5.1절 주의사항).
 *
 * 3. 존 이동은 서버가 목표 좌표만 내려주고, 실제 보간은 여기 useFrame에서
 *    lerp로 처리한다. 서버가 매 프레임 좌표를 보내면 WebSocket 트래픽이
 *    낭비된다 (5.1절).
 *
 * 4. 동시 20개 렌더링 시 GPU 부하(스키닝, 드로우콜)가 커진다. 최소한
 *    "카메라에서 먼 캐릭터는 애니메이션 업데이트 빈도를 낮춘다" 수준의
 *    최적화 지점을 남겨 둘 것 (5.1 / 10.1절).
 */

import type { Agent } from '@/lib/protocol'

export type AgentCharacterProps = {
  agent: Agent
  /** roles.model_path — modelUrl()로 절대 URL을 만들어 쓴다 */
  modelPath: string
  speech?: string
  onClick: () => void
}

export function AgentCharacter(_props: AgentCharacterProps) {
  // TODO(Phase 3): useGLTF(modelUrl(modelPath)) + useAnimations 로 구현
  return null
}
