/**
 * 도트 캐릭터 자세 매핑 테스트.
 *
 * 그림 자체는 눈으로 볼 수밖에 없지만, "상태를 빠뜨리지 않았는가"와
 * "같은 존을 쓰는 상태끼리 자세가 어긋나지 않는가"는 코드로 잡을 수 있다.
 * 상태를 새로 추가할 때 자세를 빠뜨리면 여기서 걸린다.
 */

import { describe, expect, it } from 'vitest'
import { STATE_POSE } from './pixelCharacter'
import { STATE_COLOR, STATE_ZONES } from './protocol'
import type { AgentState } from './protocol'

const STATES = Object.keys(STATE_ZONES) as AgentState[]

describe('STATE_POSE', () => {
  it('모든 상태에 자세가 있다', () => {
    STATES.forEach((s) => expect(STATE_POSE[s]).toBeTruthy())
  })

  it('idle 과 running 은 자세가 다르다', () => {
    // 자세가 같으면 상태 정보가 발밑 링에만 남는다. 멀리서는 링이 안 보인다.
    expect(STATE_POSE.idle).not.toBe(STATE_POSE.running)
  })

  it('retrying 은 running 과 같은 자세다', () => {
    // 존이 같으므로(명세 5.1절) 자세까지 다르면 같은 자리에서 두 무리로 갈린다.
    // 재시도는 색과 링으로만 구분한다.
    expect(STATE_POSE.retrying).toBe(STATE_POSE.running)
    expect(STATE_COLOR.retrying).not.toBe(STATE_COLOR.running)
  })

  it('error 와 done 은 서로 다른 자세다', () => {
    expect(STATE_POSE.error).not.toBe(STATE_POSE.done)
  })
})
