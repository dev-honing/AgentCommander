'use client'

/**
 * 에이전트 상세 사이드패널 (명세 5.2 / 7장 Phase 5) — Phase 5에서 구현.
 *
 * 캐릭터를 클릭하면 3D 씬을 벗어나지 않고 우측에서 슬라이드인한다.
 * 전체 로그(GET /api/agents/{id}/logs)와 설정을 표시한다.
 *
 * ⚠️ 패널 상태를 URL 쿼리 파라미터(?agent=agent-001)와 동기화할 것.
 *    링크 공유와 새로고침 후에도 유지되어야 한다 (5.2절).
 *    Next.js의 useSearchParams + router.replace 조합을 쓴다.
 */

export type AgentDetailPanelProps = {
  agentId: string | null
  onClose: () => void
}

export function AgentDetailPanel(_props: AgentDetailPanelProps) {
  // TODO(Phase 5): 로그 뷰어 + progress bar + 설정
  return null
}
