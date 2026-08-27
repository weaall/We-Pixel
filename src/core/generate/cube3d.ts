import type { RGBA } from '../color'
import { parseHex } from '../color'
import type { PixelDoc } from '../doc'
import { createDoc, setPixel } from '../doc'
import type { DiceRole } from './diceFrames'
import { DICE_PALETTE, DICE_ROLE_OF } from './diceFrames'

export interface Vec3 {
  x: number
  y: number
  z: number
}

/**
 * 큐브의 여섯 면.
 *
 * 마주보는 면의 합은 7이다. 축의 양끝이 마주보는 면이므로 여기서 규칙이 저절로
 * 지켜진다 — 눈 개수를 따로 검사할 필요가 없다.
 */
export const CUBE_FACES: ReadonlyArray<{ normal: Vec3; u: Vec3; v: Vec3; pips: number }> = [
  { normal: { x: 0, y: 1, z: 0 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, pips: 1 },
  { normal: { x: 0, y: -1, z: 0 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: -1 }, pips: 6 },
  { normal: { x: 0, y: 0, z: 1 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: -1, z: 0 }, pips: 2 },
  { normal: { x: 0, y: 0, z: -1 }, u: { x: -1, y: 0, z: 0 }, v: { x: 0, y: -1, z: 0 }, pips: 5 },
  { normal: { x: 1, y: 0, z: 0 }, u: { x: 0, y: 0, z: -1 }, v: { x: 0, y: -1, z: 0 }, pips: 3 },
  { normal: { x: -1, y: 0, z: 0 }, u: { x: 0, y: 0, z: 1 }, v: { x: 0, y: -1, z: 0 }, pips: 4 },
]

/** 단위 정사각형 안의 눈 자리. 면마다 방향이 달라도 이 좌표를 그 면의 축으로 옮긴다. */
const PIP_LAYOUT: Record<number, ReadonlyArray<{ u: number; v: number }>> = {
  1: [{ u: 0.5, v: 0.5 }],
  2: [
    { u: 0.28, v: 0.28 },
    { u: 0.72, v: 0.72 },
  ],
  3: [
    { u: 0.25, v: 0.25 },
    { u: 0.5, v: 0.5 },
    { u: 0.75, v: 0.75 },
  ],
  4: [
    { u: 0.28, v: 0.28 },
    { u: 0.72, v: 0.28 },
    { u: 0.28, v: 0.72 },
    { u: 0.72, v: 0.72 },
  ],
  5: [
    { u: 0.25, v: 0.25 },
    { u: 0.75, v: 0.25 },
    { u: 0.5, v: 0.5 },
    { u: 0.25, v: 0.75 },
    { u: 0.75, v: 0.75 },
  ],
  6: [
    { u: 0.27, v: 0.22 },
    { u: 0.27, v: 0.5 },
    { u: 0.27, v: 0.78 },
    { u: 0.73, v: 0.22 },
    { u: 0.73, v: 0.5 },
    { u: 0.73, v: 0.78 },
  ],
}

export function rotate(p: Vec3, r: Vec3): Vec3 {
  const cx = Math.cos(r.x)
  const sx = Math.sin(r.x)
  const cy = Math.cos(r.y)
  const sy = Math.sin(r.y)
  const cz = Math.cos(r.z)
  const sz = Math.sin(r.z)

  // Z -> Y -> X 순서. 순서를 바꾸면 같은 각도라도 다른 자세가 나온다.
  const x1 = p.x * cz - p.y * sz
  const y1 = p.x * sz + p.y * cz
  const z1 = p.z

  const x2 = x1 * cy + z1 * sy
  const y2 = y1
  const z2 = -x1 * sy + z1 * cy

  return { x: x2, y: y2 * cx - z2 * sx, z: y2 * sx + z2 * cx }
}

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const add = (a: Vec3, b: Vec3, s = 1): Vec3 => ({
  x: a.x + b.x * s,
  y: a.y + b.y * s,
  z: a.z + b.z * s,
})

/**
 * 게임에서 쓰는 2:1 등축 시선.
 *
 * 화면 y 는 아래로 자란다. 위쪽을 빼야 픽셀 좌표와 그대로 맞는다.
 */
export function project(p: Vec3): { x: number; y: number; depth: number } {
  const ISO = Math.SQRT1_2
  return {
    x: (p.x - p.z) * ISO,
    y: (p.x + p.z) * ISO * 0.5 - p.y,
    // 카메라 쪽으로 얼마나 나와 있는지. 먼 면부터 그리는 데 쓴다.
    depth: p.x + p.z - p.y * 0.0,
  }
}

/** 카메라를 향하는 방향. project 와 같은 시선에서 나온 값이다. */
const VIEW: Vec3 = { x: Math.SQRT1_2, y: Math.SQRT1_2 * 0.5, z: Math.SQRT1_2 }

export interface CubeOptions {
  size: number
  /** 큐브를 돌린 각도(라디안). */
  rot: Vec3
  /** 큐브 한 변이 차지할 픽셀. 크면 칸 밖으로 나간다. */
  scale: number
  palette?: Record<string, string>
  /** 눈을 그릴지. 빠르게 도는 칸에서는 꺼도 된다. */
  pips?: boolean
}

function colorOf(palette: Record<string, string>, role: DiceRole): RGBA {
  const char = Object.keys(DICE_ROLE_OF).find((c) => DICE_ROLE_OF[c] === role)
  const hex = char ? palette[char] : undefined
  return (hex ? parseHex(hex) : null) ?? [255, 0, 255, 255]
}

/** p = a*u + b*v 를 푼다. u 와 v 가 평행하면 null. */
function solve(
  ux: number,
  uy: number,
  vx: number,
  vy: number,
  px: number,
  py: number,
): { a: number; b: number } | null {
  const det = ux * vy - uy * vx
  if (Math.abs(det) < 1e-9) return null
  return { a: (px * vy - py * vx) / det, b: (ux * py - uy * px) / det }
}

function pipAt(a: number, b: number, value: number, radius: number): 'edge' | 'shade' | 'lit' | null {
  const layout = PIP_LAYOUT[value]
  if (!layout) return null
  for (const spot of layout) {
    const da = a - spot.u
    const db = b - spot.v
    const d = Math.sqrt(da * da + db * db)
    if (d > radius) continue
    // 파인 자국처럼 보이려면 둘레가 어둡고 안쪽 아래가 밝아야 한다.
    if (d > radius * 0.7) return 'edge'
    return db < 0 ? 'shade' : 'lit'
  }
  return null
}

/**
 * 면과 면이 만나는 선, 그리고 실루엣 안쪽 테두리를 밝게 긋는다.
 *
 * 없으면 두 면이 같은 톤일 때 하나로 뭉쳐 보인다. 참고 그림에서 이 선이
 * 입체감의 절반을 맡고 있다.
 */
function drawCreases(
  doc: PixelDoc,
  owner: Int8Array,
  isPip: Uint8Array,
  color: RGBA,
): void {
  const n = doc.w
  const mark: Array<[number, number]> = []
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x
      if (owner[i] < 0) continue
      // 눈 위에는 긋지 않는다. 눈이 잘려 개수가 안 읽힌다.
      if (isPip[i]) continue
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx
        const ny = y + dy
        const out = nx < 0 || ny < 0 || nx >= n || ny >= n
        const other = out ? -1 : owner[ny * n + nx]
        if (other !== owner[i]) {
          mark.push([x, y])
          break
        }
      }
    }
  }
  for (const [x, y] of mark) setPixel(doc, x, y, color)
}

/** 실루엣 바깥 한 칸을 외곽선으로 채운다. */
function addOutline(doc: PixelDoc, color: RGBA): void {
  const src = new Uint8ClampedArray(doc.data)
  const opaque = (x: number, y: number) =>
    x >= 0 && x < doc.w && y >= 0 && y < doc.h && src[(y * doc.w + x) * 4 + 3] !== 0

  for (let y = 0; y < doc.h; y++) {
    for (let x = 0; x < doc.w; x++) {
      if (opaque(x, y)) continue
      if (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1)) {
        setPixel(doc, x, y, color)
      }
    }
  }
}

/**
 * 돌아간 큐브를 그린다.
 *
 * 카메라를 등진 면은 버리고 먼 것부터 그린다. 깊이 검사 없이 순서만으로
 * 가리는 방식이라 볼록한 물체에만 맞지만, 주사위는 볼록하므로 충분하다.
 */
export function renderCube(o: CubeOptions): PixelDoc {
  const n = Math.max(8, Math.floor(o.size))
  const doc = createDoc(n, n)
  const palette = o.palette ?? DICE_PALETTE
  const half = 0.5

  /**
   * 빛의 방향.
   *
   * 화면 왼쪽은 +Z, 오른쪽은 +X 다. 참고 그림은 윗면과 왼쪽면이 같은 색이고
   * 오른쪽만 어두우므로, 그 둘이 같은 칸에 들어가도록 잡는다.
   */
  const light: Vec3 = { x: 0.15, y: 0.82, z: 0.55 }
  const litColor = colorOf(palette, 'faceLit')
  const shadeColor = colorOf(palette, 'faceShade')
  const edgeColor = colorOf(palette, 'edge')
  const pipColor = {
    edge: colorOf(palette, 'pipEdge'),
    shade: colorOf(palette, 'pipShade'),
    lit: colorOf(palette, 'pipLit'),
  }

  const cx = n / 2
  const cy = n / 2

  const faces = CUBE_FACES.map((face) => {
    const normal = rotate(face.normal, o.rot)
    const u = rotate(face.u, o.rot)
    const v = rotate(face.v, o.rot)
    const center: Vec3 = { x: normal.x * half, y: normal.y * half, z: normal.z * half }
    // 면 중심에서 u, v 로 반 칸씩 물러난 자리가 시작 꼭짓점이다.
    const origin = add(add(center, u, -half), v, -half)

    const po = project(origin)
    const pu = project(add(origin, u))
    const pv = project(add(origin, v))
    const brightness = Math.max(0, dot(normal, light))

    return {
      pips: face.pips,
      facing: dot(normal, VIEW),
      depth: project(center).depth,
      ox: po.x * o.scale,
      oy: po.y * o.scale,
      ux: (pu.x - po.x) * o.scale,
      uy: (pu.y - po.y) * o.scale,
      vx: (pv.x - po.x) * o.scale,
      vy: (pv.y - po.y) * o.scale,
      // 두 단계다. 참고 그림도 몸통 색이 둘뿐이고, 더 잘게 나누면 회전 중에
      // 톤이 자글거려 픽셀 아트로 보이지 않는다.
      lit: brightness > 0.45,
    }
  })
    .filter((f) => f.facing > 0)
    .sort((a, b) => a.depth - b.depth)

  const PIP_RADIUS = 0.085
  // 어느 면이 칠했는지 기억한다. 면과 면이 만나는 선을 나중에 그으려면 필요하다.
  const owner = new Int8Array(n * n).fill(-1)
  const isPip = new Uint8Array(n * n)

  faces.forEach((f, id) => {
    for (let py = 0; py < n; py++) {
      for (let px = 0; px < n; px++) {
        // 픽셀 중앙으로 판정해야 면 경계가 반 칸 밀리지 않는다.
        const sx = px + 0.5 - cx - f.ox
        const sy = py + 0.5 - cy - f.oy
        const uv = solve(f.ux, f.uy, f.vx, f.vy, sx, sy)
        if (uv === null || uv.a < 0 || uv.a > 1 || uv.b < 0 || uv.b > 1) continue

        let color = f.lit ? litColor : shadeColor
        let pip = 0
        if (o.pips !== false) {
          const hit = pipAt(uv.a, uv.b, f.pips, PIP_RADIUS)
          if (hit !== null) {
            color = pipColor[hit]
            pip = 1
          }
        }
        owner[py * n + px] = id
        isPip[py * n + px] = pip
        setPixel(doc, px, py, color)
      }
    }
  })

  drawCreases(doc, owner, isPip, edgeColor)
  addOutline(doc, colorOf(palette, 'outline'))
  return doc
}
