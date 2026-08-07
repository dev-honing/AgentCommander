/**
 * 존 안에서 캐릭터가 설 자리를 정한다.
 *
 * 씬 컴포넌트에서 떼어냈다. 여기 규칙들은 서로 맞물려 있어서 — 칸 간격이
 * 캐릭터 폭이고, 구역 크기가 존 간격보다 좁아야 하고, 20명이 구역 안에
 * 들어와야 한다 — 눈으로만 확인하면 하나를 고칠 때 다른 하나가 조용히
 * 깨진다. 순수 함수로 두고 테스트로 묶는다.
 */

import { TILE_WORLD } from './tileTexture'

/**
 * 구역 한 변의 길이 — 타일 6칸.
 *
 * 가장 가까운 두 존은 running(12,0,0)과 waiting(12,0,9)으로 간격이 9다.
 * 한 변이 9를 넘으면 두 구역이 맞붙어 경계가 사라진다.
 */
export const ZONE_PAD = TILE_WORLD * 6

/** 캐릭터 한 명이 차지하는 칸. 간격이 곧 캐릭터 폭이라 어깨가 닿되 겹치지 않는다 */
const CELL = TILE_WORLD

/** 중심에서 가까운 순으로 정렬한 격자 칸 */
let cells: [number, number][] = []

function ensureCells(count: number) {
  if (cells.length >= count) return

  // 한 변은 반드시 홀수여야 한다.
  //
  // 짝수면 격자의 중심이 칸 사이 경계에 놓여 모든 자리가 반 칸씩 밀린다.
  // 격자는 인원이 늘 때 다시 만들어지므로, 열 번째가 들어오는 순간 앞선
  // 아홉이 통째로 옆으로 옮겨 앉는 일이 벌어진다.
  let side = Math.ceil(Math.sqrt(count)) + 2
  if (side % 2 === 0) side += 1
  const half = (side - 1) / 2
  const made: [number, number][] = []
  for (let i = 0; i < side; i += 1) {
    for (let j = 0; j < side; j += 1) {
      made.push([(i - half) * CELL, (j - half) * CELL])
    }
  }
  // 거리가 같은 칸끼리는 각도로 순서를 고정한다. 안 그러면 정렬이 불안정해
  // 목록이 갱신될 때마다 캐릭터들이 자리를 맞바꾼다.
  made.sort((a, b) => {
    const da = a[0] * a[0] + a[1] * a[1]
    const db = b[0] * b[0] + b[1] * b[1]
    if (Math.abs(da - db) > 1e-6) return da - db
    return Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0])
  })
  cells = made
}

/**
 * index 번째 캐릭터가 설 자리 — 존 중심을 원점으로 한 오프셋.
 *
 * 원래는 황금각 나선으로 흩뿌렸다. 겹침은 막았지만 자리가 제각각이라
 * 타일 바닥 위에서는 캐릭터가 격자를 무시하고 떠도는 것처럼 보였다.
 */
export function zoneCell(index: number): [number, number] {
  ensureCells(index + 1)
  return cells[index]
}
