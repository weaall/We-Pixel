import type { RGBA } from '../color'
import { fromHsl } from '../color'
import type { PixelDoc } from '../doc'
import { createDoc, setPixel } from '../doc'
import { Perlin } from './perlin'
import { mulberry32 } from './rng'

/** 체형. 실루엣 비율을 정한다. */
export type SpriteShape = 'blob' | 'tall' | 'wide'

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
  shape?: SpriteShape
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
  shape: 'blob',
}

const EMPTY = 0
const BODY = 1
const OUTLINE = 2
const ACCENT = 3
/** 명암 단계. 값이 클수록 밝다. */
const DEEP = 4
const SHADOW = 5
const HIGHLIGHT = 6
const LIGHT = 7

/** 체형별 가로/세로 비율 범위. */
const SHAPE_RANGE: Record<SpriteShape, { x: [number, number]; y: [number, number] }> = {
  blob: { x: [0.72, 1.38], y: [0.72, 1.38] },
  // 범위를 넉넉히 벌린다. 겹치면 테두리 노이즈만으로도 체형이 뒤집힌다.
  tall: { x: [0.45, 0.72], y: [1.05, 1.45] },
  wide: { x: [1.05, 1.45], y: [0.45, 0.72] },
}

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
  const range = SHAPE_RANGE[o.shape ?? 'blob']
  const stretchX = range.x[0] + rand() * (range.x[1] - range.x[0])
  const stretchY = range.y[0] + rand() * (range.y[1] - range.y[0])

  let cells: Uint8Array = new Uint8Array(w * h)
  let threshold = lerp(0.62, 0.26, clamp01(o.density))
  const core = lerp(0.72, 0.3, clamp01(o.density))

  // 시드가 나쁘게 걸려 거의 빈 스프라이트가 나오면 임계값을 낮춰 다시 시도한다.
  for (let attempt = 0; attempt < 10; attempt++) {
    cells = buildBody(perlin, w, h, scale, threshold, o.mirrorX, stretchX, stretchY, core)
    cleanSilhouette(cells, w, h)
    keepLargestComponent(cells, w, h)
    if (countBody(cells) >= minPixels) break
    threshold -= 0.05
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
  /** 이 값을 넘는 감쇠는 무조건 몸통. 밀도가 높을수록 커진다. */
  core: number,
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

      // 타원 밖은 무조건 비운다.
      // 감쇠를 점수에 더하기만 하면 노이즈에 밀려 체형이 지켜지지 않는다.
      // "납작"을 골랐는데 세로로 긴 결과가 나오던 원인이다.
      if (falloff <= 0) continue

      // fbm은 옥타브 평균이라 출력이 0 근처로 뭉친다. 1.7배로 펴서
      // 노이즈가 실루엣에 요철을 만들 수 있게 한다.
      const n = clamp01(perlin.fbm(x * scale, y * scale, 2) * 1.7 + 0.5)

      // 안쪽은 노이즈와 무관하게 채운다.
      //
      // 노이즈에게 전체를 맡기면 타원이 조각나고, 가장 큰 조각이 하필 세로로
      // 길면 "납작"을 골랐는데 길쭉한 결과가 나온다. 실제로 그런 시드가 있었다.
      // 보장된 몸통을 두고 노이즈는 바깥 테두리만 흔들게 하면 체형이 지켜지면서
      // 실루엣 변화도 남는다.
      if (falloff > core || n * (0.4 + 0.6 * falloff) > threshold) {
        cells[y * w + x] = BODY
        if (mirrorX) cells[y * w + (w - 1 - x)] = BODY
      }
    }
  }
  return cells
}

/**
 * 실루엣을 다듬는다.
 *
 * 노이즈에서 바로 뽑은 형태에는 한 칸짜리 구멍과 한 칸짜리 돌기가 남는다.
 * 확대해서 보면 티가 안 나지만 1배율에서는 지저분한 잡티로만 보인다.
 * 구멍은 메우고 돌기는 깎는다.
 */
function cleanSilhouette(cells: Uint8Array, w: number, h: number): void {
  for (let pass = 0; pass < 2; pass++) {
    const src = Uint8Array.from(cells)
    const neighbours = (x: number, y: number) => {
      let n = 0
      if (y > 0 && src[(y - 1) * w + x] === BODY) n++
      if (y < h - 1 && src[(y + 1) * w + x] === BODY) n++
      if (x > 0 && src[y * w + x - 1] === BODY) n++
      if (x < w - 1 && src[y * w + x + 1] === BODY) n++
      return n
    }

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x
        const n = neighbours(x, y)
        if (src[i] === EMPTY && n >= 3) cells[i] = BODY
        else if (src[i] === BODY && n <= 1) cells[i] = EMPTY
      }
    }
  }
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

/**
 * 왼쪽 위에서 빛이 온다고 보고 입체감을 준다.
 *
 * 이전에는 상단 경계만 밝게, 하단 경계만 어둡게 칠했다. 그러면 테두리만
 * 두 가지 색인 납작한 그림이 된다. 네 방향의 경계를 가중치로 더해 다섯 단계로
 * 나누면 덩어리에 볼륨이 생긴다.
 */
function addShading(cells: Uint8Array, w: number, h: number): void {
  const src = Uint8Array.from(cells)
  const isBody = (x: number, y: number) =>
    x >= 0 && x < w && y >= 0 && y < h && src[y * w + x] === BODY

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (src[y * w + x] !== BODY) continue

      // 위/아래가 광원 방향이므로 좌우보다 가중치를 크게 준다.
      let lit = 0
      if (!isBody(x, y - 1)) lit += 2
      if (!isBody(x - 1, y)) lit += 1
      if (!isBody(x, y + 1)) lit -= 2
      if (!isBody(x + 1, y)) lit -= 1

      cells[y * w + x] =
        lit >= 2 ? LIGHT : lit === 1 ? HIGHLIGHT : lit === 0 ? BODY : lit === -1 ? SHADOW : DEEP
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

/**
 * 색조를 단계마다 옮긴다.
 *
 * 밝은 쪽은 따뜻하게(색조 +), 어두운 쪽은 차갑게(색조 -) 민다. 명도만 바꾼
 * 램프는 회색을 섞은 것처럼 탁해 보인다. 이 색조 이동이 픽셀 아트 채색에서
 * 가장 큰 차이를 만든다.
 */
function paint(cells: Uint8Array, w: number, h: number, hue: number): PixelDoc {
  const palette: Record<number, RGBA> = {
    [LIGHT]: fromHsl(hue + 28, 0.4, 0.78),
    [HIGHLIGHT]: fromHsl(hue + 14, 0.47, 0.64),
    [BODY]: fromHsl(hue, 0.52, 0.5),
    [SHADOW]: fromHsl(hue - 16, 0.56, 0.36),
    [DEEP]: fromHsl(hue - 30, 0.58, 0.24),
    [OUTLINE]: fromHsl(hue - 36, 0.55, 0.11),
    [ACCENT]: fromHsl(hue + 180, 0.72, 0.62),
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
