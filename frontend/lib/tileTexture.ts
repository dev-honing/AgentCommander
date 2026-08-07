/**
 * 타일 바닥 텍스처를 코드로 그린다.
 *
 * 도트 캐릭터를 와이어 그리드 위에 세우면 공중에 떠 보인다. 게더타운류가
 * 바닥에 붙어 보이는 이유는 타일맵 위에 서 있기 때문이다.
 *
 * 픽셀 캐릭터와 같은 규칙을 따른다 — 확대해도 경계가 살아 있어야 하므로
 * NearestFilter 를 쓰고, 텍스처는 한 번만 만들어 재사용한다.
 */

import {
  CanvasTexture,
  NearestFilter,
  NearestMipmapLinearFilter,
  RepeatWrapping,
  type Texture,
} from 'three'

/** 타일 한 칸의 픽셀 수 */
const TILE_PX = 32

/**
 * 타일 한 칸이 차지하는 월드 거리.
 *
 * 도트 팩들의 비율을 그대로 옮겼다 — 32px 타일에 16×24 캐릭터이므로,
 * 캐릭터가 한 칸보다 조금 좁고 두 칸 가까이 크다. 이 비율이 어긋나면
 * 캐릭터가 타일 위에 서 있는 게 아니라 얹혀 있는 것처럼 보인다.
 */
export const TILE_WORLD = 1.25

type Shade = {
  base: string
  alt: string
  line: string
  fleck: string
}

const FLOOR: Shade = {
  base: '#2b3856',
  alt: '#26314d',
  line: '#384770',
  fleck: '#3d4d78',
}

/**
 * 바닥 타일 한 장을 그린다.
 *
 * 두 칸짜리 체크무늬에 이음선과 얼룩을 얹었다. 완전히 균일하면 넓은 면이
 * 단조로워 보이고, 너무 화려하면 캐릭터가 묻힌다.
 */
function drawTile(ctx: CanvasRenderingContext2D, shade: Shade) {
  const half = TILE_PX / 2

  ctx.fillStyle = shade.base
  ctx.fillRect(0, 0, TILE_PX, TILE_PX)

  // 체크무늬 — 두 칸이 미세하게 다른 밝기
  ctx.fillStyle = shade.alt
  ctx.fillRect(0, 0, half, half)
  ctx.fillRect(half, half, half, half)

  // 타일 이음선
  ctx.fillStyle = shade.line
  ctx.fillRect(0, 0, TILE_PX, 1)
  ctx.fillRect(0, 0, 1, TILE_PX)
  ctx.fillRect(half - 1, 0, 1, TILE_PX)
  ctx.fillRect(0, half - 1, TILE_PX, 1)

  // 얼룩 몇 점 — 넓은 바닥이 밋밋해 보이지 않게 한다.
  // 위치를 고정값으로 둔 이유: 무작위면 새로고침마다 바닥이 달라진다.
  ctx.fillStyle = shade.fleck
  const flecks: [number, number][] = [
    [5, 9],
    [21, 4],
    [12, 19],
    [27, 24],
    [8, 27],
  ]
  flecks.forEach(([x, y]) => ctx.fillRect(x, y, 1, 1))
}

let cached: Texture | null = null

/** 무한 반복되는 바닥 타일 텍스처 */
export function floorTexture(repeat: number): Texture {
  if (!cached) {
    const canvas = document.createElement('canvas')
    canvas.width = TILE_PX
    canvas.height = TILE_PX
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.imageSmoothingEnabled = false
      drawTile(ctx, FLOOR)
    }
    cached = new CanvasTexture(canvas)
    // 가까이서는 픽셀 경계가 살아 있어야 한다 — 도트의 핵심이다
    cached.magFilter = NearestFilter
    // ⚠️ 축소는 반대로 밉맵을 써야 한다.
    //
    //    밉맵 없이 NearestFilter 로 축소하면, 멀어질수록 한 화소가 텍스처의
    //    여기저기를 찍게 된다. 카메라를 눕혀 지평선을 보면 화면 대부분이 그
    //    상태가 되어 바닥이 지글거리고 프레임이 무너진다.
    //
    //    NearestMipmapLinear 는 밉 단계 사이만 섞으므로 가까운 화면의 또렷함은
    //    그대로다. anisotropy 는 비스듬히 보이는 면의 선명도를 살린다 —
    //    지원 한도를 넘으면 드라이버가 알아서 낮춘다.
    cached.minFilter = NearestMipmapLinearFilter
    cached.generateMipmaps = true
    cached.anisotropy = 4
    cached.wrapS = RepeatWrapping
    cached.wrapT = RepeatWrapping
  }
  cached.repeat.set(repeat, repeat)
  return cached
}
