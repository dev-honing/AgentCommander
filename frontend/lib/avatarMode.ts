'use client'

/**
 * 캐릭터 표현 방식 선택.
 *
 * 에셋 방향을 정하는 중이라 세 가지를 나란히 두고 비교할 수 있게 했다.
 * 주소에 ?avatar=cube 처럼 붙이면 바뀐다.
 *
 *   sprite    도트 캐릭터 (게더타운 형식) — 이 브랜치의 기본값
 *   character 리깅 glTF 캐릭터. 모델이 없는 역할은 큐브로 물러난다
 *   cube      큐브 스텁
 *
 * 결정이 끝나면 기본값만 바꾸거나 이 파일을 지우면 된다.
 */

import { useSyncExternalStore } from 'react'

export type AvatarMode = 'sprite' | 'character' | 'cube'

const DEFAULT_MODE: AvatarMode = 'sprite'
const MODES: AvatarMode[] = ['sprite', 'character', 'cube']

/** URL은 이 화면에서 바뀌지 않으므로 구독할 것이 없다 */
const noSubscribe = () => () => {}

function readMode(): AvatarMode {
  const raw = new URLSearchParams(window.location.search).get('avatar')
  return MODES.includes(raw as AvatarMode) ? (raw as AvatarMode) : DEFAULT_MODE
}

/** 서버 렌더 시점에는 주소를 알 수 없다 */
const serverMode = () => DEFAULT_MODE

export function useAvatarMode(): AvatarMode {
  return useSyncExternalStore(noSubscribe, readMode, serverMode)
}
