'use client'

/**
 * 캐릭터 표현 방식 선택.
 *
 * 에셋 방향을 정하는 중이라 세 가지를 나란히 두고 비교할 수 있게 했다.
 *
 *   sprite    도트 캐릭터 (게더타운 형식) — 이 브랜치의 기본값
 *   character 리깅 glTF 캐릭터. 모델이 없는 역할은 큐브로 물러난다
 *   cube      큐브 스텁
 *
 * 선택은 주소(?avatar=)에 남긴다. 화면에서 바꾼 뒤 그대로 링크를 넘겨
 * "이 모습으로 보라"고 말할 수 있어야 비교가 된다 — 선택된 에이전트를
 * ?agent= 로 남기는 것과 같은 이유다 (useSelectedAgent).
 *
 * 결정이 끝나면 기본값만 바꾸거나 이 파일을 지우면 된다.
 */

import { useCallback, useSyncExternalStore } from 'react'

export type AvatarMode = 'sprite' | 'character' | 'cube'

const PARAM = 'avatar'
const DEFAULT_MODE: AvatarMode = 'sprite'
export const AVATAR_MODES: AvatarMode[] = ['sprite', 'character', 'cube']

/** 화면에 보여 줄 이름 */
export const AVATAR_LABEL: Record<AvatarMode, string> = {
  sprite: '도트',
  character: '캐릭터',
  cube: '큐브',
}

/** replaceState는 popstate를 발생시키지 않으므로 직접 알린다 */
const CHANGE_EVENT = 'agentcommander:avatar'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

function getSnapshot(): AvatarMode {
  const raw = new URLSearchParams(window.location.search).get(PARAM)
  return AVATAR_MODES.includes(raw as AvatarMode) ? (raw as AvatarMode) : DEFAULT_MODE
}

/** 서버 렌더 시점에는 주소를 알 수 없다 */
function getServerSnapshot(): AvatarMode {
  return DEFAULT_MODE
}

export function useAvatarMode() {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setMode = useCallback((next: AvatarMode) => {
    const url = new URL(window.location.href)
    url.searchParams.set(PARAM, next)
    // 표현을 몇 번 바꿔 보는 동안 뒤로가기 이력이 쌓이지 않게 replaceState 를 쓴다
    window.history.replaceState(null, '', url)
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  return { mode, setMode }
}
