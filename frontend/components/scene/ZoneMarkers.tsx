'use client'

/**
 * 바닥의 상태별 존 표식 (명세 5.1절).
 *
 * 존은 역할별이 아니라 상태별로만 나눈다. 역할이 늘어도 공간 구조는 그대로다.
 * retrying은 running과 같은 좌표를 쓰므로 표식을 따로 그리지 않는다.
 *
 * 타일맵 바닥으로 바꾸면서 원형 링에서 사각 구역으로 옮겼다. 원은 타일 격자와
 * 결이 어긋나 바닥 위에 스티커를 붙여 놓은 것처럼 보였다. 사각형은 타일 눈금과
 * 맞아떨어져 "방"으로 읽힌다 — 게더타운의 공간 구획과 같은 방식이다.
 *
 * ⚠️ 라벨은 drei의 <Text>(troika) 대신 <Html> 오버레이로 그린다.
 *    <Text>는 기본 폰트를 원격에서 받아오므로 오프라인에서 깨지고,
 *    한글 글리프도 별도 폰트 파일 없이는 렌더되지 않는다.
 *    대화풍선을 <Html>로 만들기로 한 5.2절의 판단과 같은 이유다.
 */

import { Html } from '@react-three/drei'
import { MARKED_ZONES, STATE_COLOR, STATE_ZONES } from '@/lib/protocol'
import { TILE_WORLD } from '@/lib/tileTexture'
import { Z_ZONE_LABEL } from './overlayDepth'

/**
 * 존 한 변의 길이 — 타일 6칸.
 *
 * 가장 가까운 두 존은 running(12,0,0)과 waiting(12,0,9)으로 간격이 9다.
 * 한 변이 9를 넘으면 두 구역이 맞붙어 경계가 사라지므로 7.5로 잡는다
 * (사이 간격 1.5 = 타일 한 칸 남짓). 존 좌표를 바꾸면 이 값도 함께 검토할 것.
 *
 * 20개가 한 존에 모여도 흩뿌리기 반경이 약 3.5라 구역 안에 들어온다.
 */
const PAD = TILE_WORLD * 6
/** 테두리 두께 */
const EDGE = 0.16

/** 테두리 네 변 — [중심 x, 중심 z, 폭, 깊이] */
const HALF = PAD / 2
const EDGES: [number, number, number, number][] = [
  [0, -HALF, PAD + EDGE, EDGE],
  [0, HALF, PAD + EDGE, EDGE],
  [-HALF, 0, EDGE, PAD + EDGE],
  [HALF, 0, EDGE, PAD + EDGE],
]

export function ZoneMarkers() {
  return (
    <group>
      {MARKED_ZONES.map((state) => {
        const [x, , z] = STATE_ZONES[state]
        const color = STATE_COLOR[state]
        return (
          <group key={state} position={[x, 0, z]}>
            {/* 테두리 — 네 변을 따로 그린다.
                큰 판을 깔고 그 위를 덮는 방식으로 만들면, 위 판이 반투명이라
                아래 색이 그대로 비쳐 구역 전체가 단색 슬래브로 보인다. */}
            {EDGES.map(([ex, ez, w, h], i) => (
              <mesh key={i} position={[ex, 0.01, ez]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[w, h]} />
                <meshBasicMaterial color={color} transparent opacity={0.75} />
              </mesh>
            ))}
            {/* 구역 안쪽 — 바닥 타일이 비쳐 보일 만큼만 물들인다 */}
            <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[PAD, PAD]} />
              <meshBasicMaterial color={color} transparent opacity={0.09} />
            </mesh>
            <Html
              position={[0, 0.02, PAD / 2 + 0.85]}
              center
              distanceFactor={22}
              pointerEvents="none"
              zIndexRange={Z_ZONE_LABEL}
            >
              <div className="zonelabel" style={{ color }}>
                {state}
              </div>
            </Html>
          </group>
        )
      })}
    </group>
  )
}
