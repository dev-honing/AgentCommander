'use client'

/**
 * 프레임 측정기 — 주소에 ?fps=1 을 붙였을 때만 뜬다.
 *
 * 명세 10.1절이 Phase 3(리깅 캐릭터) 진입 전 조건으로 "큐브 스텁 상태에서
 * 20개 동시 렌더링 성능을 먼저 측정할 것"을 걸었다. 매번 콘솔에 스니펫을
 * 붙여넣는 대신 화면에서 바로 볼 수 있게 한다.
 *
 * 평소에는 보이지 않으므로 화면을 어지럽히지 않는다.
 *
 * ⚠️ 브라우저 탭이 백그라운드면 requestAnimationFrame 이 초당 1회로 조절된다.
 *    창을 앞에 두고 재야 의미 있는 값이 나온다.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

/** URL은 이 화면에서 바뀌지 않으므로 구독할 것이 없다 */
const noSubscribe = () => () => {}
const hasFpsParam = () => new URLSearchParams(window.location.search).has('fps')
/** 서버 렌더 시점에는 주소를 알 수 없다 — 꺼진 것으로 시작한다 */
const offOnServer = () => false

type Reading = {
  fps: number
  /** 25ms(=40fps)를 넘긴 프레임 수. 끊김의 지표다 */
  janky: number
}

export function FpsMeter({ agentCount }: { agentCount: number }) {
  const enabled = useSyncExternalStore(noSubscribe, hasFpsParam, offOnServer)
  const [reading, setReading] = useState<Reading | null>(null)
  const [worst, setWorst] = useState<number | null>(null)
  const raf = useRef(0)

  useEffect(() => {
    if (!enabled) return

    let frames = 0
    let janky = 0
    let last = performance.now()
    let windowStart = last

    const tick = () => {
      const now = performance.now()
      if (now - last > 25) janky += 1
      last = now
      frames += 1

      // 1초마다 한 번씩 갱신한다. 매 프레임 setState 하면 측정 대상이 오염된다.
      if (now - windowStart >= 1000) {
        const fps = Math.round((frames * 1000) / (now - windowStart))
        setReading({ fps, janky })
        setWorst((prev) => (prev === null ? fps : Math.min(prev, fps)))
        frames = 0
        janky = 0
        windowStart = now
      }
      raf.current = requestAnimationFrame(tick)
    }

    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [enabled])

  if (!enabled) return null

  const fps = reading?.fps ?? 0
  const tone = fps >= 50 ? '#22c55e' : fps >= 30 ? '#eab308' : '#ef4444'

  return (
    <div className="fps">
      <span className="fps-value" style={{ color: tone }}>
        {fps} fps
      </span>
      <span className="fps-sub">
        에이전트 {agentCount} · 최저 {worst ?? '—'} · 끊김 {reading?.janky ?? 0}
      </span>
    </div>
  )
}
