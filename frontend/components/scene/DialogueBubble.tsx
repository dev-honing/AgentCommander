'use client'

/**
 * 대화풍선 (명세 5.2절).
 *
 * 3D 오브젝트가 아니라 @react-three/drei의 <Html> 오버레이로 만든다.
 * 텍스트 렌더링 품질과 유지보수성 때문이다 — 특히 한글은 3D 텍스트로 그리면
 * 별도 폰트 파일을 실어야 하고 품질도 떨어진다.
 *
 * 표시 텍스트는 서버가 이미 100자로 잘라 보낸다. 최근 LLM 응답을 별도 요약
 * 호출 없이 앞부분만 자르는 것이라, 추가 비용도 지연도 없다.
 */

import { Html } from '@react-three/drei'
import { Z_BUBBLE } from './overlayDepth'

type Props = {
  text: string
  /** 캐릭터 머리 위 오프셋 */
  position?: [number, number, number]
  /** retrying/error처럼 강조가 필요한 상태의 색. 없으면 기본 말풍선 */
  accent?: string
}

export function DialogueBubble({ text, position = [0, 1.5, 0], accent }: Props) {
  return (
    <Html
      position={position}
      center
      distanceFactor={10}
      pointerEvents="none"
      zIndexRange={Z_BUBBLE}
    >
      <div className="bubble" style={accent ? { color: accent } : undefined}>
        {text}
      </div>
    </Html>
  )
}
