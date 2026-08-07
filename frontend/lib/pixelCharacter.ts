/**
 * 도트 캐릭터 텍스처를 코드로 그린다.
 *
 * 큐브 스텁과 같은 역할이다 — 진짜 스프라이트 팩을 구하기 전에 "도트로 가면
 * 어떤 느낌인가"를 먼저 보기 위한 것. 나중에 팩을 넣으면 이 파일만 안 쓰게 된다.
 *
 * 참고한 선례: Pixel Agents 는 JIK-A-4 의 Metro City 팩, SkyOffice 는 LimeZu
 * 팩을 쓴다. 둘 다 기성 스프라이트 시트라, 이 경로는 리깅 캐릭터와 달리
 * 블렌더 작업이 필요 없다.
 */

import { CanvasTexture, NearestFilter, type Texture } from 'three'
import type { AgentState } from './protocol'

/** 스프라이트 격자 크기. 실제 도트 팩들이 쓰는 비율에 맞췄다 */
export const SPRITE_W = 16
export const SPRITE_H = 24

/**
 * 자세.
 *
 * 상태를 색으로만 구분하면 발밑 링 하나에 모든 정보가 몰린다. 멀리서 보면
 * 링은 작고 캐릭터가 크므로, 자세가 먼저 눈에 들어와야 상태가 읽힌다.
 *
 *   stand  서 있음 — 팔을 늘어뜨리고 다리만 꼼지락거린다
 *   work   일하는 중 — 앞으로 숙이고 두 손을 앞에 모은다
 *   down   주저앉음 — 고개와 어깨를 떨군다
 *   cheer  끝남 — 두 팔을 든다
 */
export type Pose = 'stand' | 'work' | 'down' | 'cheer'

/** 상태별 자세. retrying 은 running 과 같은 존을 쓰므로 자세도 같다 (명세 5.1절) */
export const STATE_POSE: Record<AgentState, Pose> = {
  idle: 'stand',
  running: 'work',
  waiting: 'stand',
  retrying: 'work',
  error: 'down',
  done: 'cheer',
}

type Palette = {
  hair: string
  shirt: string
  pants: string
  shoes: string
}

const SKIN = '#f2c9a0'
const OUTLINE = '#1b1730'

/**
 * 역할별 배색.
 *
 * ⚠️ 상태 색(STATE_COLOR)과 겹치지 않게 골랐다. 상태는 발밑 링으로 표시하므로
 *    옷 색이 초록·노랑·빨강이면 "지금 running 인가?"와 "coder 인가?"가 섞인다.
 */
const PALETTES: Record<string, Palette> = {
  researcher: { hair: '#3a2a18', shirt: '#2f7d8f', pants: '#333f5c', shoes: '#241f38' },
  coder: { hair: '#1f1a2e', shirt: '#6b4bb0', pants: '#2a3550', shoes: '#241f38' },
  reviewer: { hair: '#5a3a1a', shirt: '#a2556e', pants: '#333f5c', shoes: '#241f38' },
}
const FALLBACK: Palette = { hair: '#40364f', shirt: '#7b8794', pants: '#3a4356', shoes: '#241f38' }

function paletteFor(role: string): Palette {
  return PALETTES[role] ?? FALLBACK
}

type Pen = (x: number, y: number, w: number, h: number, color: string) => void

/**
 * 머리 — 자세와 무관하게 모양이 같고 높이만 달라진다.
 * dy 만큼 내리면 어깨에 파묻힌 것처럼 보여 풀 죽은 느낌이 난다.
 */
function drawHead(px: Pen, p: Palette, dy: number) {
  px(4, 2 + dy, 8, 9, SKIN)
  px(4, 2 + dy, 8, 3, p.hair) // 앞머리
  px(3, 4 + dy, 1, 4, p.hair) // 옆머리
  px(12, 4 + dy, 1, 4, p.hair)
  px(6, 7 + dy, 1, 1, OUTLINE) // 눈
  px(9, 7 + dy, 1, 1, OUTLINE)
}

/** 다리 — step 으로 좌우를 어긋나게 해 꼼지락거리는 느낌을 낸다 */
function drawLegs(px: Pen, p: Palette, step: number, dy: number) {
  px(5, 18 + dy, 2, 4 - step, p.pants)
  px(9, 18 + dy, 2, 3 + step, p.pants)
  px(5, 22 - step + dy, 2, 1, p.shoes)
  px(9, 21 + step + dy, 2, 1, p.shoes)
}

/**
 * 한 프레임을 그린다.
 *
 * step 은 0과 1을 번갈아 쓰는 값이다. 도트에서는 한 칸만 어긋나게 해도
 * 충분히 살아 있어 보인다.
 */
function drawFrame(ctx: CanvasRenderingContext2D, role: string, pose: Pose, step: number) {
  const p = paletteFor(role)
  const px: Pen = (x, y, w, h, color) => {
    ctx.fillStyle = color
    ctx.fillRect(x, y, w, h)
  }

  ctx.clearRect(0, 0, SPRITE_W, SPRITE_H)

  if (pose === 'work') {
    // 앞으로 숙인 자세 — 몸 전체를 한 칸 내리고 두 손을 앞에 모은다.
    // 손 한쪽만 위아래로 움직여 자판을 두드리는 것처럼 보이게 한다.
    drawHead(px, p, 1)
    px(5, 12, 6, 6, p.shirt) // 몸통
    px(3, 12, 2, 4, p.shirt) // 팔
    px(11, 12, 2, 4, p.shirt)
    px(4, 15 + step, 3, 2, SKIN) // 앞으로 모은 손
    px(9, 16 - step, 3, 2, SKIN)
    drawLegs(px, p, step, 1)
    return
  }

  if (pose === 'down') {
    // 고개를 떨구고 팔을 늘어뜨린 자세. 다리는 움직이지 않는다.
    drawHead(px, p, 2)
    px(5, 13, 6, 6, p.shirt)
    px(3, 14, 2, 5, p.shirt)
    px(11, 14, 2, 5, p.shirt)
    px(3, 19, 2, 2, SKIN)
    px(11, 19, 2, 2, SKIN)
    px(5, 20, 2, 3, p.pants)
    px(9, 20, 2, 3, p.pants)
    px(5, 22, 2, 1, p.shoes)
    px(9, 22, 2, 1, p.shoes)
    return
  }

  if (pose === 'cheer') {
    // 두 팔을 들고 한 칸 뛴다
    const hop = step
    drawHead(px, p, -hop)
    px(5, 11 - hop, 6, 7, p.shirt)
    px(3, 6 - hop, 2, 6, p.shirt) // 위로 뻗은 팔
    px(11, 6 - hop, 2, 6, p.shirt)
    px(3, 4 - hop, 2, 2, SKIN) // 손
    px(11, 4 - hop, 2, 2, SKIN)
    // 뛰는 동안에는 두 다리를 모은다
    px(5, 18 - hop, 2, 4, p.pants)
    px(9, 18 - hop, 2, 4, p.pants)
    px(5, 22 - hop, 2, 1, p.shoes)
    px(9, 22 - hop, 2, 1, p.shoes)
    return
  }

  // stand — 팔을 늘어뜨리고 좌우를 한 칸 어긋나게 둔다
  drawHead(px, p, 0)
  px(5, 11, 6, 7, p.shirt)
  px(3, 11 + step, 2, 5, p.shirt)
  px(11, 11 + (1 - step), 2, 5, p.shirt)
  px(3, 16 + step, 2, 2, SKIN)
  px(11, 16 + (1 - step), 2, 2, SKIN)
  drawLegs(px, p, step, 0)
}

/** 역할·자세별 텍스처를 한 번만 만들어 재사용한다 */
const cache = new Map<string, Texture[]>()

/**
 * 역할과 자세에 맞는 프레임 텍스처 배열을 돌려준다.
 *
 * 캐릭터 수만큼 캔버스를 만들면 낭비이므로 역할·자세 단위로 캐시한다 —
 * 에이전트 20개가 떠도 텍스처는 조합 수만큼만 생긴다.
 */
export function pixelCharacterFrames(role: string, pose: Pose): Texture[] {
  const key = `${role}/${pose}`
  const hit = cache.get(key)
  if (hit) return hit

  const frames = [0, 1].map((step) => {
    const canvas = document.createElement('canvas')
    canvas.width = SPRITE_W
    canvas.height = SPRITE_H
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.imageSmoothingEnabled = false
      drawFrame(ctx, role, pose, step)
    }
    const tex = new CanvasTexture(canvas)
    // 도트는 뭉개지면 안 된다 — 확대해도 픽셀 경계가 살아 있어야 한다
    tex.magFilter = NearestFilter
    tex.minFilter = NearestFilter
    tex.generateMipmaps = false
    return tex
  })

  cache.set(key, frames)
  return frames
}
