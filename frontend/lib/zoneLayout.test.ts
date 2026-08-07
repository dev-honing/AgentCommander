/**
 * 존 배치 규칙 테스트.
 *
 * 여기 값들은 서로 맞물려 있다 — 존 좌표(명세 5.1절), 구역 크기, 칸 간격,
 * 한 존에 들어갈 인원. 하나를 고치면 다른 하나가 조용히 깨지는데, 화면을
 * 봐야만 드러나서 알아채기 어렵다. 실제로 겹침·이탈로 세 번 고쳤다.
 */

import { describe, expect, it } from 'vitest'
import { MARKED_ZONES, STATE_ZONES } from './protocol'
import { TILE_WORLD } from './tileTexture'
import { ZONE_PAD, zoneCell } from './zoneLayout'

/** 명세 10.1절이 성능 기준으로 삼은 동시 표시 수 */
const MAX_AGENTS = 20
/** 한 존에 몰릴 수 있는 현실적인 상한. 이보다 늘어도 규칙은 같아야 한다 */
const CROWD = 80

function spots(total: number): [number, number][] {
  return Array.from({ length: total }, (_, i) => zoneCell(i, total))
}

describe('zoneCell', () => {
  it('같은 자리를 두 번 내주지 않는다', () => {
    for (const total of [1, 20, 50, CROWD]) {
      const seen = new Set(spots(total).map((s) => s.join(',')))
      expect(seen.size, `${total}명`).toBe(total)
    }
  })

  it('여유가 있으면 이웃과 캐릭터 폭만큼 떨어진다', () => {
    const placed = spots(MAX_AGENTS)
    for (let a = 0; a < placed.length; a += 1) {
      for (let b = a + 1; b < placed.length; b += 1) {
        const gap = Math.hypot(placed[a][0] - placed[b][0], placed[a][1] - placed[b][1])
        expect(gap).toBeGreaterThanOrEqual(TILE_WORLD - 1e-6)
      }
    }
  })

  it('아무리 붐벼도 구역 밖으로 나가지 않는다', () => {
    // 예전에는 격자가 그냥 바깥으로 자라서, 한 존에 34명이 모이자 캐릭터들이
    // 벽을 뚫고 나가 서 있었다. 방이 좁으면 밖으로 나가는 게 아니라 붙어 서야 한다.
    const limit = ZONE_PAD / 2
    for (const total of [20, 34, 50, CROWD]) {
      for (const [x, z] of spots(total)) {
        // 캐릭터 폭의 절반까지 감안해도 테두리를 넘지 않아야 한다
        expect(Math.abs(x) + TILE_WORLD / 2, `${total}명`).toBeLessThanOrEqual(limit + 1e-6)
        expect(Math.abs(z) + TILE_WORLD / 2, `${total}명`).toBeLessThanOrEqual(limit + 1e-6)
      }
    }
  })

  it('가운데부터 채운다', () => {
    // 인원이 적을 때 구역 구석에 흩어져 있으면 "저기 모여 일한다"로 안 읽힌다
    const placed = spots(MAX_AGENTS)
    expect(Math.hypot(...placed[0])).toBeLessThan(Math.hypot(...placed[placed.length - 1]))
  })

  it('인원이 늘어도 서로 자리를 맞바꾸지 않는다', () => {
    // 격자는 인원이 바뀔 때 다시 계산된다. 그때 기준점이 흔들리면 한 명이
    // 들어올 때마다 기존 인원 전체가 엉뚱하게 옮겨 앉는다 — 실제로 열 번째에서
    // 반 칸씩 밀리는 문제가 있었다.
    //
    // 간격은 좁아질 수 있다(붐비면 모여 선다). 하지만 방향은 그대로여야 한다.
    const dir = (p: [number, number]) => {
      const len = Math.hypot(...p)
      return len < 1e-9 ? '0' : `${(p[0] / len).toFixed(4)},${(p[1] / len).toFixed(4)}`
    }

    const base = spots(8).map(dir)
    for (const total of [10, 26, 50, CROWD]) {
      expect(spots(total).slice(0, 8).map(dir), `${total}명`).toEqual(base)
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
