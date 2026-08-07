'use client'

/**
 * 캐릭터 표현 전환기.
 *
 * 방향은 도트로 정해졌지만 전환기는 남긴다. 렌더링 비용을 다시 잴 때
 * (?fps=1 과 함께) 세 표현을 같은 조건에서 비교할 수 있어야 하고, 실제로
 * 이 전환기로 비교해서 방향을 정했다 — avatarMode 의 설명 참고.
 */

import { AVATAR_LABEL, AVATAR_MODES, useAvatarMode } from '@/lib/avatarMode'

export function AvatarSwitch() {
  const { mode, setMode } = useAvatarMode()

  return (
    <div className="avatar-switch" role="group" aria-label="캐릭터 표현">
      {AVATAR_MODES.map((m) => (
        <button
          key={m}
          type="button"
          className={m === mode ? 'avatar-switch-on' : undefined}
          aria-pressed={m === mode}
          onClick={() => setMode(m)}
        >
          {AVATAR_LABEL[m]}
        </button>
      ))}
    </div>
  )
}
