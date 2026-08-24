import type { RGBA } from '../color'
import { fromHsl } from '../color'
import type { PixelDoc } from '../doc'
import { createDoc, setPixel } from '../doc'
import { Perlin } from './perlin'
import { mulberry32 } from './rng'

export interface SpriteOptions {
  w: number
  h: number
  seed: number
  /** 0-360. 팔레트 전체가 이 색조에서 파생된다. */
  hue: number
  /** 0-1. 몸통이 캔버스를 얼마나 채우는지. */
  density: number
  mirrorX: boolean
  outline: boolean
  shading: boolean
  /** 보색 포인트(눈 같은 디테일)를 넣는다. */
  accent: boolean
}

export const defaultSpriteOptions: Omit<SpriteOptions, 'seed'> = {
  w: 32,
  h: 32,
  hue: 210,
  density: 0.55,
  mirrorX: true,
  outline: true,
  shading: true,
  accent: true,
}

const EMPTY = 0
const BODY = 1
const OUTLINE = 2
const HIGHLIGHT = 3
const SHADOW = 4
const ACCENT = 5

/**
 * 순수 난수로 채우면 TV 노이즈가 나온다. 펄린 노이즈로 덩어리를 만들고
 * 타원형 감쇠로 가운데에 모으고, 가장 큰 연결 덩어리만 남겨야 생물처럼 읽힌다.
 */
export function generateSprite(o: SpriteOptions): PixelDoc {
  const rand = mulberry32(o.seed)
  const perlin = new Perlin(rand)
  const { w, h } = o

  // 옥타브를 2개로 줄인다. 32px에서 3옥타브는 픽셀 이하 디테일이라 노이즈로만 보인다.
  const scale = 3.8 / Math.max(w, h)
  const minPixels = Math.max(8, Math.floor(w * h * 0.06))

  // 시드마다 체형 비율을 바꿔야 실루엣이 전부 같은 원형이 되지 않는다.
  const stretchX = 0.72 + rand() * 0.66
  const stretchY = 0.72 + rand() * 0.66

  let cells: Uint8Array = new Uint8Array(w * h)
  let threshold = lerp(0.85, 0.35, clamp01(o.density))

  // 시드가 나쁘게 걸려 거의 빈 스프라이트가 나오면 임계값을 낮춰 다시 시도한다.
  for (let attempt = 0; attempt < 10; attempt++) {
    cells = buildBody(perlin, w, h, scale, threshold, o.mirrorX, stretchX, stretchY)
    keepLargestComponent(cells, w, h)
    if (countBody(cells) >= minPixels) break
    threshold -= 0.06
  }

  if (o.accent) addAccent(cells, w, h, rand, o.mirrorX)
  if (o.shading) addShading(cells, w, h)
  if (o.outline) addOutline(cells, w, h)

  return paint(cells, w, h, o.hue)
}

function buildBody(
  perlin: Perlin,
  w: number,
  h: number,
  scale: number,
  threshold: number,
  mirrorX: boolean,
  stretchX: number,
  stretchY: number,
): Uint8Array {
  const cells = new Uint8Array(w * h)
  const halfW = mirrorX ? Math.ceil(w / 2) : w
  const cx = (w - 1) / 2
  const cy = (h - 1) / 2

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < halfW; x++) {
      if (x === 0 || y === 0 || y === h - 1 || x === w - 1) continue

      const nx = (x - cx) / ((w / 2) * stretchX)
      const ny = (y - cy) / ((h / 2) * stretchY)
      const falloff = 1 - Math.sqrt(nx * nx + ny * ny)

      // fbm은 옥타브 평균이라 출력이 0 근처로 뭉친다. 1.7배로 펴서
      // 노이즈가 감쇠보다 넓은 범위를 갖게 해야 실루엣에 요철이 생긴다.
      const n = clamp01(perlin.fbm(x * scale, y * scale, 2) * 1.7 + 0.5)

      if (n * 0.85 + falloff * 0.55 > threshold) {
        cells[y * w + x] = BODY
        if (mirrorX) cells[y * w + (w - 1 - x)] = BODY
      }
    }
  }
  return cells
}

/** 떠다니는 파편을 제거한다. 이 단계가 없으면 결과가 얼룩처럼 보인다. */
function keepLargestComponent(cells: Uint8Array, w: number, h: number): void {
  const labels = new Int32Array(w * h).fill(-1)
  let best = -1
  let bestSize = 0

  for (let start = 0; start < cells.length; start++) {
    if (cells[start] !== BODY || labels[start] !== -1) continue
    const stack = [start]
    labels[start] = start
    let size = 0
    while (stack.length > 0) {
      const i = stack.pop()!
      size++
      const x = i % w
      const y = (i / w) | 0
      if (x > 0) push(i - 1)
      if (x < w - 1) push(i + 1)
      if (y > 0) push(i - w)
      if (y < h - 1) push(i + w)
    }
    if (size > bestSize) {
      bestSize = size
      best = start
    }

    function push(j: number): void {
      if (cells[j] === BODY && labels[j] === -1) {
        labels[j] = start
        stack.push(j)
      }
    }
  }

  if (best < 0) return
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === BODY && labels[i] !== best) cells[i] = EMPTY
  }
}

/** 위쪽에서 빛이 온다고 보고 상단 경계는 밝게, 하단 경계는 어둡게. */
function addShading(cells: Uint8Array, w: number, h: number): void {
  const src = Uint8Array.from(cells)
  const isBody = (x: number, y: number) =>
    x >= 0 && x < w && y >= 0 && y < h && src[y * w + x] === BODY

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (src[y * w + x] !== BODY) continue
      if (!isBody(x, y - 1)) cells[y * w + x] = HIGHLIGHT
      else if (!isBody(x, y + 1)) cells[y * w + x] = SHADOW
    }
  }
}

/** 몸통에 인접한 빈 칸을 외곽선으로. shading 이후에 돌려야 하이라이트도 감싼다. */
function addOutline(cells: Uint8Array, w: number, h: number): void {
  const src = Uint8Array.from(cells)
  const filled = (x: number, y: number) =>
    x >= 0 && x < w && y >= 0 && y < h && src[y * w + x] !== EMPTY

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (src[y * w + x] !== EMPTY) continue
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
        cells[y * w + x] = OUTLINE
      }
    }
  }
}

/** 상단 40% 안에서 폭이 넉넉한 행을 찾아 눈처럼 보이는 포인트를 넣는다. */
function addAccent(
  cells: Uint8Array,
  w: number,
  h: number,
  rand: () => number,
  mirrorX: boolean,
): void {
  const limit = Math.max(2, Math.floor(h * 0.45))
  const candidates: Array<{ y: number; left: number; right: number }> = []

  for (let y = 1; y < limit; y++) {
    let left = -1
    let right = -1
    for (let x = 0; x < w; x++) {
      if (cells[y * w + x] === BODY) {
        if (left < 0) left = x
        right = x
      }
    }
    if (left >= 0 && right - left >= 3) candidates.push({ y, left, right })
  }
  if (candidates.length === 0) return

  const pick = candidates[Math.floor(rand() * candidates.length)]
  const inset = 1 + Math.floor(rand() * Math.max(1, Math.floor((pick.right - pick.left) / 4)))
  const ax = pick.left + inset

  if (cells[pick.y * w + ax] === BODY) cells[pick.y * w + ax] = ACCENT
  const mx = mirrorX ? w - 1 - ax : pick.right - inset
  if (mx !== ax && cells[pick.y * w + mx] === BODY) cells[pick.y * w + mx] = ACCENT
}

function paint(cells: Uint8Array, w: number, h: number, hue: number): PixelDoc {
  const palette: Record<number, RGBA> = {
    [BODY]: fromHsl(hue, 0.5, 0.5),
    [HIGHLIGHT]: fromHsl(hue + 8, 0.42, 0.68),
    [SHADOW]: fromHsl(hue - 12, 0.55, 0.31),
    [OUTLINE]: fromHsl(hue, 0.45, 0.1),
    [ACCENT]: fromHsl(hue + 180, 0.7, 0.62),
  }
  const doc = createDoc(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cell = cells[y * w + x]
      if (cell === EMPTY) continue
      setPixel(doc, x, y, palette[cell])
    }
  }
  return doc
}

function countBody(cells: Uint8Array): number {
  let n = 0
  for (let i = 0; i < cells.length; i++) if (cells[i] === BODY) n++
  return n
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
