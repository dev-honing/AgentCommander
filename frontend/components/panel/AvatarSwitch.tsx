'use client'

/**
 * 캐릭터 표현 전환기.
 *
 * 에셋 방향을 고르는 중이라 세 가지가 공존한다. 주소를 직접 고쳐야만
 * 바꿀 수 있으면 나란히 놓고 비교하기 어려워서 화면에 꺼내 뒀다.
 *
 * 방향이 정해지면 이 컴포넌트와 avatarMode 를 함께 지운다.
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
