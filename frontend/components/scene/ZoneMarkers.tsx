'use client'

/**
 * 바닥의 상태별 존 표식 (명세 5.1절).
 *
 * 존은 역할별이 아니라 상태별로만 나눈다. 역할이 늘어도 공간 구조는 그대로다.
 * retrying은 running과 같은 좌표를 쓰므로 표식을 따로 그리지 않는다.
 *
 * ⚠️ 라벨은 drei의 <Text>(troika) 대신 <Html> 오버레이로 그린다.
 *    <Text>는 기본 폰트를 원격에서 받아오므로 오프라인에서 깨지고,
 *    한글 글리프도 별도 폰트 파일 없이는 렌더되지 않는다.
 *    대화풍선을 <Html>로 만들기로 한 5.2절의 판단과 같은 이유다.
 */

import { Html } from '@react-three/drei'
import { MARKED_ZONES, STATE_COLOR, STATE_ZONES } from '@/lib/protocol'
import { Z_ZONE_LABEL } from './overlayDepth'

/**
 * 존 링 반지름.
 *
 * 가장 가까운 두 존은 running(5,0,0)과 waiting(5,0,3)으로 간격이 3이다.
 * 반지름이 1.5를 넘으면 두 링이 서로 파고들어 어느 구역인지 읽히지 않는다.
 * 여유를 두고 1.3으로 잡는다 — 존 좌표를 바꾸면 이 값도 함께 검토할 것.
 */
const ZONE_RADIUS = 1.3

export function ZoneMarkers() {
  return (
    <group>
      {MARKED_ZONES.map((state) => {
        const [x, , z] = STATE_ZONES[state]
        const color = STATE_COLOR[state]
        return (
          <group key={state} position={[x, 0.01, z]}>
            {/* 바닥에 눕힌 링 */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[ZONE_RADIUS - 0.04, ZONE_RADIUS, 64]} />
              <meshBasicMaterial color={color} transparent opacity={0.55} />
            </mesh>
            {/* 옅은 채움 — 존 안쪽임을 알아보게 한다 */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[ZONE_RADIUS - 0.04, 64]} />
              <meshBasicMaterial color={color} transparent opacity={0.07} />
            </mesh>
            <Html
              position={[0, 0.02, ZONE_RADIUS + 0.5]}
              center
              distanceFactor={13}
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
