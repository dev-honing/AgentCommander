'use client'

/**
 * 선택한 에이전트로 카메라를 붙였다 떼는 장치.
 *
 * 존 다섯 개가 한눈에 들어오려면 카메라가 멀어야 하는데, 그 거리에서는
 * 도트 캐릭터가 30픽셀 남짓이라 표정도 옷 색도 잘 안 보인다. 게더타운은
 * 내 캐릭터를 따라다니기 때문에 늘 가깝다.
 *
 * 그래서 기본은 전체 조망, 캐릭터를 고르면 다가가는 방식으로 나눴다.
 * 빈 바닥을 눌러 선택을 풀면 원래 자리로 돌아온다.
 *
 * ⚠️ 다가가는 동안에도 시점 각도는 유지한다. 각도까지 손대면 사용자가 돌려
 *    놓은 방향이 매번 초기화돼 조작을 빼앗긴 느낌이 든다.
 */

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

/**
 * 전체 조망 시점.
 *
 * 존의 무게중심은 (0,0,-1.5)지만 화면 왼쪽을 에이전트 목록이, 아래쪽을
 * 입력창이 덮는다. 그만큼 목표점을 옮겨 실제로 비어 있는 영역 한가운데에
 * 맵이 오게 한다 — 안 그러면 error 존이 목록 뒤에 숨는다.
 */
export const HOME_TARGET: [number, number, number] = [-4.5, -1.5, 2.4]
export const HOME_POSITION: [number, number, number] = [15, 20.5, 35]
/** 캐릭터에 다가갔을 때의 거리 */
const FOCUS_DISTANCE = 15
/** 카메라가 목표에 붙는 속도. 값이 클수록 빠르다 */
const EASE = 3.2
/** 이보다 가까워지면 다 왔다고 보고 손을 뗀다 */
const SETTLED = 0.05

type Props = {
  /** 따라갈 지점. null이면 전체 조망으로 돌아간다 */
  focus: [number, number, number] | null
  /**
   * 따라가는 대상의 id.
   *
   * 좌표가 아니라 이 값이 바뀔 때만 카메라를 다시 붙인다. 좌표로 판단하면
   * 대상이 걸어가는 매 순간이 "새 선택"으로 읽혀, 사용자가 돌려 놓은 시점이
   * 계속 초기화된다.
   */
  focusId: string | null
}

export function CameraRig({ focus, focusId }: Props) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null

  const wantTarget = useRef(new Vector3())
  const wantPosition = useRef(new Vector3())
  const offset = useRef(new Vector3())
  /** 지금 카메라를 움직이는 중인가 */
  const moving = useRef(false)
  /** 사용자가 직접 시점을 잡았는가 — 그렇다면 따라가기를 멈춘다 */
  const manual = useRef(false)

  // 선택이 바뀌면 다시 움직이기 시작한다
  useEffect(() => {
    manual.current = false
    moving.current = true
  }, [focusId])

  // 사용자가 드래그·휠을 쓰면 그 순간부터 카메라를 놓아 준다.
  // 이걸 안 하면 선택된 동안 시점을 못 돌린다.
  useEffect(() => {
    if (!controls) return
    const release = () => {
      manual.current = true
    }
    controls.addEventListener('start', release)
    return () => controls.removeEventListener('start', release)
  }, [controls])

  useFrame((_, delta) => {
    if (!controls || !moving.current || manual.current) return

    if (focus) {
      // 발끝이 아니라 가슴 높이를 본다. 바닥을 겨누면 캐릭터가 화면 위쪽에 걸린다.
      wantTarget.current.set(focus[0], focus[1] + 1, focus[2])
      // 지금 보고 있는 방향을 그대로 두고 거리만 좁힌다
      offset.current.copy(camera.position).sub(controls.target).normalize()
      wantPosition.current.copy(wantTarget.current).addScaledVector(offset.current, FOCUS_DISTANCE)
    } else {
      wantTarget.current.set(...HOME_TARGET)
      wantPosition.current.set(...HOME_POSITION)
    }

    const t = 1 - Math.exp(-EASE * delta)
    controls.target.lerp(wantTarget.current, t)
    camera.position.lerp(wantPosition.current, t)
    controls.update()

    // 조망으로 돌아가는 건 한 번이면 끝이다. 반면 캐릭터는 존을 옮겨 다니므로
    // 계속 따라붙어야 한다 — 다 왔다고 손을 떼면 화면 밖으로 걸어 나간다.
    if (!focus && camera.position.distanceTo(wantPosition.current) < SETTLED) {
      moving.current = false
    }
  })

  return null
}
