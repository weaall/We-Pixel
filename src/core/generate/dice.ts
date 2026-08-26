import type { RGBA } from '../color'
import { fromHsl } from '../color'
import type { PixelDoc } from '../doc'
import { createDoc, setPixel } from '../doc'
import { Perlin } from './perlin'
import { mulberry32 } from './rng'

/** 재질. 팔레트 대비와 표면 잡티가 달라진다. */
export type DiceMaterial = 'stone' | 'metal' | 'wood' | 'gem'

export interface DiceOptions {
  /** 정사각 캔버스 한 변. */
  size: number
  seed: number
  hue: number
  material: DiceMaterial
  /** 위·왼쪽·오른쪽 면의 눈 개수. */
  pips: [number, number, number]
  outline: boolean
  /** 표면 잡티. 0이면 매끈하다. */
  speckle: number
}

export const defaultDiceOptions: Omit<DiceOptions, 'seed'> = {
  size: 32,
  hue: 110,
  material: 'stone',
  pips: [1, 2, 3],
  outline: true,
  speckle: 0.5,
}

const EMPTY = 0
const TOP = 1
const LEFT = 2
const RIGHT = 3
const TOP_DARK = 4
const LEFT_DARK = 5
const RIGHT_DARK = 6
const PIP = 7
const OUTLINE = 8

type Vec = { x: number; y: number }

/** 재질별 명도 폭과 채도. 금속은 대비가 크고 나무는 탁하다. */
const MATERIAL: Record<DiceMaterial, { sat: number; spread: number; pipLight: boolean }> = {
  stone: { sat: 0.28, spread: 0.2, pipLight: false },
  metal: { sat: 0.16, spread: 0.3, pipLight: true },
  wood: { sat: 0.42, spread: 0.16, pipLight: false },
  gem: { sat: 0.62, spread: 0.26, pipLight: true },
}

/**
 * 표준 주사위 눈 배치. 단위 정사각형 안의 상대 좌표다.
 * 면마다 모양이 달라도 이 좌표를 그 면의 축으로 옮기면 된다.
 */
const PIP_LAYOUT: Record<number, ReadonlyArray<Vec>> = {
  1: [{ x: 0.5, y: 0.5 }],
  2: [
    { x: 0.28, y: 0.28 },
    { x: 0.72, y: 0.72 },
  ],
  3: [
    { x: 0.25, y: 0.25 },
    { x: 0.5, y: 0.5 },
    { x: 0.75, y: 0.75 },
  ],
  4: [
    { x: 0.28, y: 0.28 },
    { x: 0.72, y: 0.28 },
    { x: 0.28, y: 0.72 },
    { x: 0.72, y: 0.72 },
  ],
  5: [
    { x: 0.25, y: 0.25 },
    { x: 0.75, y: 0.25 },
    { x: 0.5, y: 0.5 },
    { x: 0.25, y: 0.75 },
    { x: 0.75, y: 0.75 },
  ],
  6: [
    { x: 0.27, y: 0.22 },
    { x: 0.27, y: 0.5 },
    { x: 0.27, y: 0.78 },
    { x: 0.73, y: 0.22 },
    { x: 0.73, y: 0.5 },
    { x: 0.73, y: 0.78 },
  ],
}

/**
 * 등축 주사위를 만든다.
 *
 * 세 면이 모두 평행사변형이므로 한 가지 방법으로 다룬다. 점을 두 모서리 벡터의
 * 선형결합으로 풀면 면 안에 있는지와 면 안에서의 좌표를 한 번에 얻는다 —
 * 눈 위치와 표면 잡티가 그 좌표를 그대로 쓴다.
 */
export function generateDice(o: DiceOptions): PixelDoc {
  const rand = mulberry32(o.seed)
  const perlin = new Perlin(rand)
  const n = Math.max(12, Math.floor(o.size))
  const cells = new Uint8Array(n * n)

  // 외곽선이 잘리지 않게 여백을 둔다.
  const margin = o.outline ? 2 : 1
  const halfW = (n - margin * 2) / 2
  const topH = halfW / 2
  const sideH = halfW * 0.86
  const cx = n / 2
  // 큐브 전체 높이 = 위면(2*topH) + 옆면(sideH). 세로로 가운데 맞춘다.
  const y0 = (n - (topH * 2 + sideH)) / 2

  const T: Vec = { x: cx, y: y0 }
  const R: Vec = { x: cx + halfW, y: y0 + topH }
  const B: Vec = { x: cx, y: y0 + topH * 2 }
  const L: Vec = { x: cx - halfW, y: y0 + topH }
  const down: Vec = { x: 0, y: sideH }

  const faces = [
    { id: TOP, dark: TOP_DARK, o: L, u: sub(T, L), v: sub(B, L), pips: o.pips[0] },
    { id: LEFT, dark: LEFT_DARK, o: L, u: sub(B, L), v: down, pips: o.pips[1] },
    { id: RIGHT, dark: RIGHT_DARK, o: B, u: sub(R, B), v: down, pips: o.pips[2] },
  ]

  const pipRadius = Math.max(0.6, n / 26)
  const speckleScale = 6 / n

  for (let py = 0; py < n; py++) {
    for (let px = 0; px < n; px++) {
      // 픽셀 중앙으로 판정해야 면 경계가 반 칸 밀리지 않는다.
      const p: Vec = { x: px + 0.5, y: py + 0.5 }

      for (const face of faces) {
        const uv = solve(face.u, face.v, sub(p, face.o))
        if (uv === null || uv.a < 0 || uv.a > 1 || uv.b < 0 || uv.b > 1) continue

        let cell = face.id
        // 잡티는 면 좌표로 뽑는다. 화면 좌표로 뽑으면 무늬가 면을 가로질러 이어진다.
        if (o.speckle > 0) {
          const noise = perlin.noise(
            (uv.a * n + face.id * 37) * speckleScale,
            (uv.b * n + face.id * 53) * speckleScale,
          )
          if (noise > 0.55 - o.speckle * 0.35) cell = face.dark
        }

        if (isPip(uv, face.pips, pipRadius / (n * 0.4))) cell = PIP
        cells[py * n + px] = cell
        break
      }
    }
  }

  if (o.outline) addOutline(cells, n)
  return paint(cells, n, o)
}

function isPip(uv: { a: number; b: number }, value: number, radius: number): boolean {
  const layout = PIP_LAYOUT[value]
  if (!layout) return false
  for (const spot of layout) {
    const da = uv.a - spot.x
    const db = uv.b - spot.y
    if (da * da + db * db <= radius * radius) return true
  }
  return false
}

/** p = a*u + b*v 를 푼다. u와 v가 평행하면 null. */
function solve(u: Vec, v: Vec, p: Vec): { a: number; b: number } | null {
  const det = u.x * v.y - u.y * v.x
  if (Math.abs(det) < 1e-9) return null
  return {
    a: (p.x * v.y - p.y * v.x) / det,
    b: (u.x * p.y - u.y * p.x) / det,
  }
}

function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y }
}

function addOutline(cells: Uint8Array, n: number): void {
  const src = Uint8Array.from(cells)
  const filled = (x: number, y: number) =>
    x >= 0 && x < n && y >= 0 && y < n && src[y * n + x] !== EMPTY

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (src[y * n + x] !== EMPTY) continue
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
        cells[y * n + x] = OUTLINE
      }
    }
  }
}

function paint(cells: Uint8Array, n: number, o: DiceOptions): PixelDoc {
  const m = MATERIAL[o.material]
  const hue = o.hue

  // 위에서 빛이 온다. 위면이 가장 밝고 오른쪽이 가장 어둡다.
  // 밝은 쪽은 색조를 따뜻하게, 어두운 쪽은 차갑게 민다.
  const tone = (level: number, shift: number) => fromHsl(hue + shift, m.sat, level)
  const palette: Record<number, RGBA> = {
    [TOP]: tone(0.5 + m.spread, 14),
    [TOP_DARK]: tone(0.5 + m.spread * 0.65, 8),
    [LEFT]: tone(0.5, 0),
    [LEFT_DARK]: tone(0.5 - m.spread * 0.35, -6),
    [RIGHT]: tone(0.5 - m.spread * 0.7, -14),
    [RIGHT_DARK]: tone(0.5 - m.spread, -20),
    [PIP]: m.pipLight ? tone(0.5 + m.spread * 1.5, 26) : tone(0.14, -26),
    [OUTLINE]: tone(0.09, -30),
  }

  const doc = createDoc(n, n)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const cell = cells[y * n + x]
      if (cell === EMPTY) continue
      setPixel(doc, x, y, palette[cell])
    }
  }
  return doc
}

/**
 * 시드로 보이는 세 면의 눈을 뽑는다.
 *
 * 실제 주사위는 마주보는 면의 합이 7이다. 그래서 (1,6) (2,5) (3,4) 중
 * 각 쌍에서 하나씩만 보인다 — 같은 눈이 두 번 보이거나 1과 6이 함께
 * 보이는 일은 있을 수 없다.
 */
export function randomPips(seed: number): [number, number, number] {
  const rand = mulberry32(seed)
  const picked = [
    rand() < 0.5 ? 1 : 6,
    rand() < 0.5 ? 2 : 5,
    rand() < 0.5 ? 3 : 4,
  ]
  // 어느 면에 놓일지도 섞는다. 안 그러면 위면이 늘 1 아니면 6이다.
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const t = picked[i]
    picked[i] = picked[j]
    picked[j] = t
  }
  return [picked[0], picked[1], picked[2]]
}
