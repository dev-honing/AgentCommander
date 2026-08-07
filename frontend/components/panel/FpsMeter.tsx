'use client'

/**
 * 프레임 측정기 — 주소에 ?fps=1 을 붙였을 때만 뜬다.
 *
 * 명세 10.1절이 Phase 3(리깅 캐릭터) 진입 전 조건으로 "큐브 스텁 상태에서
 * 20개 동시 렌더링 성능을 먼저 측정할 것"을 걸었다. 매번 콘솔에 스니펫을
 * 붙여넣는 대신 화면에서 바로 볼 수 있게 한다.
 *
 * 평소에는 보이지 않으므로 화면을 어지럽히지 않는다.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

/** URL은 이 화면에서 바뀌지 않으므로 구독할 것이 없다 */
const noSubscribe = () => () => {}
const hasFpsParam = () => new URLSearchParams(window.location.search).has('fps')
/** 서버 렌더 시점에는 주소를 알 수 없다 — 꺼진 것으로 시작한다 */
const offOnServer = () => false

/** 이 시간을 넘긴 프레임을 끊김으로 센다 (=40fps 미만) */
const JANK_MS = 25

type Stats = {
  /** 직전 1초 구간의 프레임 수 */
  fps: number
  /** 워밍업 이후 구간 중 가장 낮았던 값 */
  worst: number | null
  /** 측정 시작 이후 누적 끊김 프레임 수 */
  janky: number
  /** 측정에 쓰인 시간(초) */
  seconds: number
}

const EMPTY: Stats = { fps: 0, worst: null, janky: 0, seconds: 0 }

/**
 * 큰 숫자의 색.
 *
 * 기준은 60fps 화면 — 여유 / 눈에 띄기 시작 / 끊겨 보임.
 *
 * ⚠️ 색은 반드시 **지금 화면에 뜬 그 숫자**를 따라야 한다. 전에는 큰 숫자를
 *    최저값 기준으로 칠했는데, "98 fps"가 빨갛게 보이니 무엇이 문제라는
 *    건지 읽을 방법이 없었다. 최저값은 보조 줄에 숫자로만 둔다.
 */
function toneFor(fps: number): string {
  if (fps >= 50) return '#22c55e'
  if (fps >= 30) return '#eab308'
  return '#ef4444'
}

export function FpsMeter({ agentCount }: { agentCount: number }) {
  const enabled = useSyncExternalStore(noSubscribe, hasFpsParam, offOnServer)
  const [stats, setStats] = useState<Stats>(EMPTY)
  const raf = useRef(0)
  /** 탭이 다시 앞으로 나오면 그동안의 왜곡된 값을 버린다 */
  const restart = useRef(0)

  useEffect(() => {
    if (!enabled) return

    const onVisible = () => {
      if (document.visibilityState === 'visible') restart.current += 1
    }
    document.addEventListener('visibilitychange', onVisible)

    let frames = 0
    let janky = 0
    let last = performance.now()
    let windowStart = last
    let epoch = restart.current
    // 첫 구간은 버린다.
    //
    // 백그라운드 탭에서는 브라우저가 requestAnimationFrame 을 초당 1회로
    // 낮춘다. 그 상태로 창을 앞으로 가져오면 첫 1초에 프레임이 한두 개뿐이라
    // fps 가 0으로 계산되고, "최저"는 최솟값이라 그 0에 영원히 붙잡힌다.
    let warmup = true

    const tick = () => {
      const now = performance.now()

      // 탭이 다시 보이게 됐다면 처음부터 다시 잰다
      if (epoch !== restart.current) {
        epoch = restart.current
        frames = 0
        janky = 0
        windowStart = now
        last = now
        warmup = true
        setStats(EMPTY)
        raf.current = requestAnimationFrame(tick)
        return
      }

      if (now - last > JANK_MS) janky += 1
      last = now
      frames += 1

      // 1초마다 한 번만 갱신한다. 매 프레임 setState 하면 측정 대상이 오염된다.
      if (now - windowStart >= 1000) {
        const fps = Math.round((frames * 1000) / (now - windowStart))

        if (warmup) {
          warmup = false
        } else {
          setStats((prev) => ({
            fps,
            worst: prev.worst === null ? fps : Math.min(prev.worst, fps),
            janky: prev.janky + janky,
            seconds: prev.seconds + 1,
          }))
        }

        frames = 0
        janky = 0
        windowStart = now
      }
      raf.current = requestAnimationFrame(tick)
    }

    raf.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <div className="fps">
      <span className="fps-value" style={{ color: toneFor(stats.fps) }}>
        {stats.fps} fps
      </span>
      <span className="fps-sub">
        에이전트 {agentCount} · 최저 {stats.worst ?? '측정 중'} · 끊김 {stats.janky}
        {stats.seconds > 0 && ` · ${stats.seconds}초`}
      </span>
    </div>
  )
}
