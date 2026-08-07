'use client'

/**
 * 캐릭터에 마우스를 올렸는지 추적한다.
 *
 * 커서 모양 변경과 세 표현(도트·큐브·리깅)의 중복을 한군데로 모은다.
 * 표현마다 따로 두면 한쪽만 고쳐서 동작이 어긋난다.
 */

import { useCallback, useState } from 'react'

export function useHover() {
  const [hovered, setHovered] = useState(false)

  const onPointerOver = useCallback(() => {
    setHovered(true)
    document.body.style.cursor = 'pointer'
  }, [])

  const onPointerOut = useCallback(() => {
    setHovered(false)
    document.body.style.cursor = 'auto'
  }, [])

  return { hovered, onPointerOver, onPointerOut }
}
