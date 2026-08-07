/**
 * 존 안에서 캐릭터가 설 자리를 정한다.
 *
 * 씬 컴포넌트에서 떼어냈다. 여기 규칙들은 서로 맞물려 있어서 — 칸 간격이
 * 캐릭터 폭이고, 구역 크기가 존 간격보다 좁아야 하고, 인원이 늘어도 구역
 * 안에 있어야 한다 — 눈으로만 확인하면 하나를 고칠 때 다른 하나가 조용히
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

/** 여유가 있을 때의 칸 간격. 캐릭터 폭과 같아서 어깨가 닿되 겹치지 않는다 */
const ROOMY_SPACING = TILE_WORLD

/**
 * 격자 한 변의 칸 수.
 *
 * ⚠️ 반드시 홀수여야 한다. 짝수면 격자의 중심이 칸 사이 경계에 놓여 모든
 *    자리가 반 칸씩 밀린다. 격자는 인원이 늘 때 다시 계산되므로, 그 순간
 *    앞선 인원이 통째로 옆으로 옮겨 앉는 일이 벌어진다.
 */
function gridSide(total: number): number {
  const need = Math.max(1, Math.ceil(Math.sqrt(Math.max(total, 1))))
  return need % 2 === 0 ? need + 1 : need
}

/**
 * 인원에 맞춘 칸 간격.
 *
 * 구역은 방이다. 사람이 늘었다고 벽을 밀 수는 없으니 — 존 간격이 9라
 * 구역을 더 키우면 옆 구역과 맞붙는다 — 대신 서로 가까이 선다. 실제로
 * 붐비는 방에서 벌어지는 일이고, "이 캐릭터들은 이 존 소속"이라는 정보가
 * 유지된다. 예전에는 격자가 그냥 바깥으로 자라서 캐릭터가 벽을 뚫고 나갔다.
 *
 * 캐릭터 폭의 절반을 빼 두는 이유는 가장자리 캐릭터가 테두리를 넘지 않게
 * 하기 위해서다.
 */
function spacingFor(side: number): number {
  if (side <= 1) return ROOMY_SPACING
  return Math.min(ROOMY_SPACING, (ZONE_PAD - TILE_WORLD) / (side - 1))
}

/**
 * 중심에서 가까운 순으로 정렬한 격자 칸 — 간격을 곱하기 전의 정수 좌표.
 *
 * 간격과 분리해 둔다. 인원이 늘어 간격이 좁아져도 "몇 번째가 어느 칸"은
 * 그대로여서, 캐릭터들이 자리를 맞바꾸지 않고 다 같이 조금씩 모여든다.
 */
let unitCells: [number, number][] = []

function ensureUnitCells(side: number) {
  const needed = side * side
  if (unitCells.length >= needed) return

  const half = (side - 1) / 2
  const made: [number, number][] = []
  for (let i = 0; i < side; i += 1) {
    for (let j = 0; j < side; j += 1) {
      made.push([i - half, j - half])
    }
  }
  // 거리가 같은 칸끼리는 각도로 순서를 고정한다. 안 그러면 정렬이 불안정해
  // 목록이 갱신될 때마다 캐릭터들이 존 안에서 자리를 맞바꾼다.
  made.sort((a, b) => {
    const da = a[0] * a[0] + a[1] * a[1]
    const db = b[0] * b[0] + b[1] * b[1]
    if (Math.abs(da - db) > 1e-9) return da - db
    return Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0])
  })
  unitCells = made
}

/**
 * index 번째 캐릭터가 설 자리 — 존 중심을 원점으로 한 오프셋.
 *
 * total 은 같은 존에 있는 인원 전체다. 몇 명이 들어와 있는지 알아야 얼마나
 * 붙어 설지 정할 수 있다.
 */
export function zoneCell(index: number, total: number): [number, number] {
  const side = gridSide(total)
  const spacing = spacingFor(side)
  ensureUnitCells(side)
  const [gx, gz] = unitCells[index] ?? [0, 0]
  return [gx * spacing, gz * spacing]
}
