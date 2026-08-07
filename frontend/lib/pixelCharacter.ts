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

/** 스프라이트 격자 크기. 실제 도트 팩들이 쓰는 비율에 맞췄다 */
export const SPRITE_W = 16
export const SPRITE_H = 24

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

/**
 * 한 프레임을 그린다.
 *
 * step 은 다리 위치를 바꾸는 값이다. 0과 1을 번갈아 쓰면 걷거나 꼼지락거리는
 * 느낌이 난다 — 도트에서는 이 정도만으로도 충분히 살아 있어 보인다.
 */
function drawFrame(ctx: CanvasRenderingContext2D, role: string, step: number) {
  const p = paletteFor(role)
  const px = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(x, y, w, h)
  }

  ctx.clearRect(0, 0, SPRITE_W, SPRITE_H)

  // 머리 (4~11 x, 2~10 y)
  px(4, 2, 8, 9, SKIN)
  px(4, 2, 8, 3, p.hair) // 앞머리
  px(3, 4, 1, 4, p.hair) // 옆머리
  px(12, 4, 1, 4, p.hair)
  px(6, 7, 1, 1, OUTLINE) // 눈
  px(9, 7, 1, 1, OUTLINE)

  // 몸통 (5~10 x, 11~17 y)
  px(5, 11, 6, 7, p.shirt)
  // 팔 — 걷는 단계에 따라 한 칸 어긋나게 둔다
  px(3, 11 + step, 2, 5, p.shirt)
  px(11, 11 + (1 - step), 2, 5, p.shirt)
  px(3, 16 + step, 2, 2, SKIN) // 손
  px(11, 16 + (1 - step), 2, 2, SKIN)

  // 다리 (18~21 y)
  px(5, 18, 2, 4 - step, p.pants)
  px(9, 18, 2, 3 + step, p.pants)
  // 신발
  px(5, 22 - step, 2, 1, p.shoes)
  px(9, 21 + step, 2, 1, p.shoes)
}

/** 역할별 텍스처를 한 번만 만들어 재사용한다 */
const cache = new Map<string, Texture[]>()

/**
 * 역할에 맞는 프레임 텍스처 배열을 돌려준다.
 *
 * 캐릭터 수만큼 캔버스를 만들면 낭비이므로 역할 단위로 캐시한다 —
 * 에이전트 20개가 떠도 텍스처는 역할 수만큼만 생긴다.
 */
export function pixelCharacterFrames(role: string): Texture[] {
  const hit = cache.get(role)
  if (hit) return hit

  const frames = [0, 1].map((step) => {
    const canvas = document.createElement('canvas')
    canvas.width = SPRITE_W
    canvas.height = SPRITE_H
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.imageSmoothingEnabled = false
      drawFrame(ctx, role, step)
    }
    const tex = new CanvasTexture(canvas)
    // 도트는 뭉개지면 안 된다 — 확대해도 픽셀 경계가 살아 있어야 한다
    tex.magFilter = NearestFilter
    tex.minFilter = NearestFilter
    tex.generateMipmaps = false
    return tex
  })

  cache.set(role, frames)
  return frames
}
