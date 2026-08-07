'use client'

/**
 * 타일맵 바닥.
 *
 * 와이어 그리드를 대신한다. 그리드 위에서는 캐릭터가 허공에 떠 보였는데,
 * 이는 도트 캐릭터에서 특히 두드러졌다 — 게더타운류가 바닥에 붙어 보이는 건
 * 타일 위에 서 있기 때문이다.
 *
 * 큐브·리깅 캐릭터 모드에서도 같은 바닥을 쓴다. 표현이 달라도 바닥은
 * 하나여야 존 배치를 같은 눈으로 비교할 수 있다.
 */

import { useMemo } from 'react'
import { floorTexture, TILE_WORLD } from '@/lib/tileTexture'

/**
 * 바닥 한 변의 길이.
 *
 * 존이 x∈[-12,12], z∈[-12,9] 에 퍼져 있고 카메라 최대 거리가 60이므로
 * 어느 각도에서도 가장자리가 화면에 들어오지 않을 만큼 넉넉해야 한다.
 * 끝은 안개(fog)가 먹으므로 잘린 티가 나지 않는다.
 */
const SIZE = 220

export function TileFloor() {
  const texture = useMemo(() => floorTexture(SIZE / TILE_WORLD), [])

  return (
    <mesh
      // 존 표식(y=0.01)과 겹쳐 z-fighting 나지 않도록 살짝 아래에 둔다
      position={[0, -0.01, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[SIZE, SIZE]} />
      {/* 조명을 받되 반사는 없앤다. 도트 바닥에 하이라이트가 생기면 어색하다 */}
      <meshLambertMaterial map={texture} />
    </mesh>
  )
}
