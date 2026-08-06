'use client'

/**
 * 선택된 에이전트를 URL 쿼리 파라미터와 동기화한다 (명세 5.2절).
 *
 * "패널 상태는 ?agent=agent-001 과 동기화해 링크 공유·새로고침 후에도
 * 유지되게 한다"는 요구를 만족시킨다.
 *
 * 설계 메모 두 가지:
 *
 * 1. next/navigation의 useSearchParams를 쓰지 않는다. 그쪽은 정적 프리렌더를
 *    포기시켜(CSR bailout) Suspense 경계를 강제하는데, 여기 필요한 건
 *    "주소에 선택 상태를 남기고 새로고침 시 복원"뿐이라 그 비용을 치를
 *    이유가 없다.
 *
 * 2. useState + useEffect로 주소를 읽어오는 대신 useSyncExternalStore를 쓴다.
 *    선택 상태의 원본은 React state가 아니라 브라우저 히스토리다. 외부 소스를
 *    구독하는 형태로 두면 마운트 직후 상태를 한 번 덮어쓰는 렌더가 사라지고,
 *    서버 렌더 시점(window 없음)도 getServerSnapshot으로 안전하게 처리된다.
 */

import { useCallback, useSyncExternalStore } from 'react'

const PARAM = 'agent'
/** replaceState는 popstate를 발생시키지 않으므로 직접 알린다 */
const CHANGE_EVENT = 'agentcommander:selection'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

function getSnapshot(): string | null {
  return new URLSearchParams(window.location.search).get(PARAM)
}

/** 서버 렌더 시점에는 주소를 알 수 없다 — 선택 없음으로 시작한다 */
function getServerSnapshot(): string | null {
  return null
}

export function useSelectedAgent() {
  const selectedId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const select = useCallback((id: string | null) => {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set(PARAM, id)
    else url.searchParams.delete(PARAM)

    // pushState가 아니라 replaceState — 캐릭터를 여러 개 눌러 보는 동안
    // 뒤로가기 이력이 쌓이면 브라우저 뒤로가기가 사실상 쓸 수 없게 된다.
    window.history.replaceState(null, '', url)
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  return { selectedId, select }
}
