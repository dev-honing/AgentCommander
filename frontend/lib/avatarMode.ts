'use client'

/**
 * 캐릭터 표현 방식 선택.
 *
 *   sprite    도트 캐릭터 — **확정된 방향이자 기본값**
 *   character 리깅 glTF 캐릭터. 모델이 없는 역할은 큐브로 물러난다
 *   cube      큐브 스텁
 *
 * 도트로 정한 이유는 성능 여유다. 20개 기준 최저 fps 가 도트 98, 리깅 73인데
 * 이 도구는 에이전트 수가 늘어나는 쪽으로 간다 — docs/에셋-방향-비교.md 참고.
 *
 * 나머지 둘을 지우지 않은 것은 의도적이다. "적은 수를 크게 보여주는" 화면이
 * 필요해지면 리깅 쪽을 되살릴 수 있고, 렌더링 비용을 다시 잴 때 큐브가
 * 기준선 역할을 한다.
 *
 * 선택은 주소(?avatar=)에 남긴다. 화면에서 바꾼 뒤 그대로 링크를 넘겨
 * "이 모습으로 보라"고 말할 수 있어야 비교가 된다 — 선택된 에이전트를
 * ?agent= 로 남기는 것과 같은 이유다 (useSelectedAgent).
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
