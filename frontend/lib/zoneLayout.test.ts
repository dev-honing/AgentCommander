/**
 * 존 배치 규칙 테스트.
 *
 * 여기 값들은 서로 맞물려 있다 — 존 좌표(명세 5.1절), 구역 크기, 칸 간격,
 * 한 존에 들어갈 인원. 하나를 고치면 다른 하나가 조용히 깨지는데, 화면을
 * 봐야만 드러나서 알아채기 어렵다. 실제로 겹침 문제로 두 번 고쳤다.
 */

import { describe, expect, it } from 'vitest'
import { MARKED_ZONES, STATE_ZONES } from './protocol'
import { TILE_WORLD } from './tileTexture'
import { ZONE_PAD, zoneCell } from './zoneLayout'

/** 명세 10.1절이 성능 기준으로 삼은 동시 표시 수 */
const MAX_AGENTS = 20

describe('zoneCell', () => {
  it('같은 자리를 두 번 내주지 않는다', () => {
    const seen = new Set(
      Array.from({ length: MAX_AGENTS }, (_, i) => zoneCell(i).join(',')),
    )
    expect(seen.size).toBe(MAX_AGENTS)
  })

  it('이웃과 최소 한 칸 이상 떨어진다', () => {
    const spots = Array.from({ length: MAX_AGENTS }, (_, i) => zoneCell(i))
    for (let a = 0; a < spots.length; a += 1) {
      for (let b = a + 1; b < spots.length; b += 1) {
        const gap = Math.hypot(spots[a][0] - spots[b][0], spots[a][1] - spots[b][1])
        // 칸 간격이 곧 캐릭터 폭이다. 이보다 좁으면 어깨가 겹친다.
        expect(gap).toBeGreaterThanOrEqual(TILE_WORLD - 1e-6)
      }
    }
  })

  it('20명이 모여도 구역 안에 들어온다', () => {
    const limit = ZONE_PAD / 2
    for (let i = 0; i < MAX_AGENTS; i += 1) {
      const [x, z] = zoneCell(i)
      // 캐릭터 폭의 절반까지 감안해도 테두리를 넘지 않아야 한다
      expect(Math.abs(x) + TILE_WORLD / 2).toBeLessThanOrEqual(limit)
      expect(Math.abs(z) + TILE_WORLD / 2).toBeLessThanOrEqual(limit)
    }
  })

  it('가운데부터 채운다', () => {
    // 인원이 적을 때 구역 구석에 흩어져 있으면 "저기 모여 일한다"로 안 읽힌다
    const first = Math.hypot(...zoneCell(0))
    const last = Math.hypot(...zoneCell(MAX_AGENTS - 1))
    expect(first).toBeLessThan(last)
  })

  it('인원이 늘어도 앞사람들 자리는 그대로다', () => {
    // 격자는 인원이 늘 때 다시 만들어진다. 그때 기준점이 흔들리면 새 한 명이
    // 들어올 때마다 기존 인원 전체가 옆으로 옮겨 앉는다 — 실제로 열 번째에서
    // 반 칸씩 밀리는 문제가 있었다.
    const snapshot = (n: number) =>
      Array.from({ length: n }, (_, i) => zoneCell(i).join(','))

    const early = snapshot(8)
    for (const grow of [10, 20, 40, 81]) {
      zoneCell(grow - 1)
      expect(snapshot(8)).toEqual(early)
    }
  })
})

describe('존 배치', () => {
  it('구역끼리 겹치지 않는다', () => {
    const marks = MARKED_ZONES.map((s) => STATE_ZONES[s])
    for (let a = 0; a < marks.length; a += 1) {
      for (let b = a + 1; b < marks.length; b += 1) {
        const dx = Math.abs(marks[a][0] - marks[b][0])
        const dz = Math.abs(marks[a][2] - marks[b][2])
        // 사각 구역이므로 한 축만 떨어져 있어도 겹치지 않는다
        expect(Math.max(dx, dz)).toBeGreaterThan(ZONE_PAD)
      }
    }
  })

  it('retrying 은 running 과 같은 자리를 쓴다', () => {
    // 명세 5.1절 — 존은 다섯 개고, 재시도는 색과 연출로만 구분한다
    expect(STATE_ZONES.retrying).toEqual(STATE_ZONES.running)
    expect(MARKED_ZONES).not.toContain('retrying')
  })
})
