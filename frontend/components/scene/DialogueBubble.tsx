'use client'

/**
 * 대화풍선 (명세 5.2절) — Phase 4에서 구현.
 *
 * 3D 오브젝트가 아니라 @react-three/drei의 <Html> 오버레이로 만든다.
 * 텍스트 렌더링 품질과 유지보수성 때문이다.
 *
 * 표시 텍스트는 최근 LLM 응답을 별도 요약 호출 없이 앞부분만 잘라 쓴다
 * (100자 절삭). 추가 비용과 지연이 없다는 것이 이 선택의 이유다.
 * 절삭은 서버(agent_speak 생성 시점)에서 이미 이뤄진 상태로 온다.
 */

export type DialogueBubbleProps = {
  text: string
  /** 캐릭터 머리 위 오프셋 */
  offset?: [number, number, number]
}

export function DialogueBubble(_props: DialogueBubbleProps) {
  // TODO(Phase 4): <Html position={offset} center distanceFactor={8}> 로 구현
  return null
}
