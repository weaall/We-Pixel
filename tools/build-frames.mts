/**
 * 참고 주사위 PNG 를 기본 프레임 모듈로 굽는다.
 *
 *   npx tsx tools/build-frames.mts frames
 *
 * frames/dice 에 등축 여섯 장, frames/face 에 정면 여섯 장을 둔다. 파일 이름의
 * 숫자가 윗면 눈이다.
 *
 * 절차적으로 그린 주사위는 사람이 그린 것과 같아질 수 없다. 그래서 형태는
 * 그리지 않고 받아 둔다 — 이 모듈이 그 형태다. 생성기는 팔레트만 갈아끼운다.
 *
 * 두 가족이 팔레트를 **함께** 쓴다. 따로 매기면 배색 하나를 열두 장에 똑같이
 * 입힐 수 없어 세트로 보이지 않는다.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RGBA } from '../src/core/color'
import { toHex, toHsl } from '../src/core/color'
import { packRow } from '../src/core/codec'
import { getPixel } from '../src/core/doc'
import type { PixelDoc } from '../src/core/doc'
import { decodePng } from '../src/import/pngDecode'
import { toLogicalGrid } from '../src/core/resample'

const root = process.argv[2] ?? 'frames'
const TRANSPARENT_CHAR = '.'
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const keyOf = (c: RGBA) => (c[3] === 0 ? TRANSPARENT_CHAR : toHex(c))

const die = (msg: string): never => {
  console.error(msg)
  process.exit(1)
}

interface Frame {
  top: number
  file: string
  doc: PixelDoc
  scale: number
}

function load(dir: string): Frame[] {
  const files = readdirSync(dir)
    .filter((f) => /^[1-6]\.png$/i.test(f))
    .sort()
  if (files.length !== 6) die(`${dir} 에 1.png ~ 6.png 여섯 장이 있어야 합니다 (${files.length}장).`)

  return files.map((file) => {
    const { doc, scale } = toLogicalGrid(decodePng(readFileSync(join(dir, file))))
    return { top: Number(file[0]), file: `${dir}/${file}`, doc, scale }
  })
}

const iso = load(join(root, 'dice'))
const face = load(join(root, 'face'))
const all = [...iso, ...face]

const { w, h } = all[0].doc
for (const f of all) {
  if (f.doc.w !== w || f.doc.h !== h) {
    die(`크기가 섞였습니다: ${f.file} 은 ${f.doc.w}x${f.doc.h} 인데 앞의 것은 ${w}x${h} 입니다.`)
  }
}

// ---- 거의 같은 색 합치기 ------------------------------------------------

/** 두 색의 채널 차 중 가장 큰 값. */
function gap(a: RGBA, b: RGBA): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))
}

/**
 * 눈으로 구분되지 않는 차이는 같은 색으로 합친다.
 *
 * 손으로 그린 그림에는 채널 하나가 어긋난 색이 섞인다. 그대로 두면 공용
 * 팔레트에서 서로 다른 자리를 차지해 배색 하나를 열두 장에 못 입힌다.
 *
 * 기준은 등축 쪽이다. 먼저 굽던 가족이고 장수도 같으니 어느 한쪽을 정해야 하면
 * 그쪽이 맞다.
 */
const SNAP = 2
const anchors: RGBA[] = []
for (const f of iso) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = getPixel(f.doc, x, y)
      if (c[3] === 0) continue
      if (!anchors.some((a) => gap(a, c) === 0)) anchors.push([c[0], c[1], c[2], c[3]])
    }
  }
}

const snapped = new Map<string, string>()
for (const f of face) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = getPixel(f.doc, x, y)
      if (c[3] === 0) continue
      const near = anchors.find((a) => gap(a, c) > 0 && gap(a, c) <= SNAP)
      if (!near) continue
      snapped.set(`${toHex(c)} -> ${toHex(near)}`, f.file)
      f.doc.data[(y * w + x) * 4] = near[0]
      f.doc.data[(y * w + x) * 4 + 1] = near[1]
      f.doc.data[(y * w + x) * 4 + 2] = near[2]
    }
  }
}
for (const [pair] of snapped) console.error(`합침: ${pair} (채널차 ${SNAP} 이하)`)

// ---- 공용 팔레트 --------------------------------------------------------

const usage = new Map<string, { n: number; c: RGBA }>()
for (const f of all) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = getPixel(f.doc, x, y)
      if (c[3] === 0) continue
      const hit = usage.get(keyOf(c))
      if (hit) hit.n++
      else usage.set(keyOf(c), { n: 1, c })
    }
  }
}
const ordered = [...usage.entries()].sort((a, b) => b[1].n - a[1].n)
if (ordered.length > ALPHABET.length) die(`색이 ${ordered.length}종으로 너무 많습니다.`)

const charOf = new Map<string, string>()
const palette: Record<string, string> = {}
ordered.forEach(([hex], i) => {
  charOf.set(hex, ALPHABET[i])
  palette[ALPHABET[i]] = hex
})
palette[TRANSPARENT_CHAR] = 'transparent'

const charAt = (doc: PixelDoc, x: number, y: number): string => {
  const c = getPixel(doc, x, y)
  return c[3] === 0 ? TRANSPARENT_CHAR : (charOf.get(keyOf(c)) as string)
}

function rowsOf(doc: PixelDoc): string[] {
  const rows: string[] = []
  for (let y = 0; y < h; y++) {
    let row = ''
    for (let x = 0; x < w; x++) row += charAt(doc, x, y)
    rows.push(packRow(row))
  }
  return rows
}

// ---- 실루엣 기하 --------------------------------------------------------

function geometry(doc: PixelDoc) {
  const spans: Array<{ y: number; min: number; max: number }> = []
  for (let y = 0; y < h; y++) {
    let min = -1
    let max = -1
    for (let x = 0; x < w; x++) {
      if (getPixel(doc, x, y)[3] === 0) continue
      if (min < 0) min = x
      max = x
    }
    if (min >= 0) spans.push({ y, min, max })
  }
  const width = Math.max(...spans.map((s) => s.max - s.min))
  // 실루엣이 넓어지다 멈추는 첫 줄이 좌우 꼭짓점이다.
  const waist = spans.find((s) => s.max - s.min === width) as { y: number; min: number; max: number }
  return { cx: (waist.min + waist.max) / 2, halfW: width / 2, waistY: waist.y, topH: waist.y - spans[0].y }
}

// ---- 역할 판별 ----------------------------------------------------------

const ROLES = [
  'outline',
  'edge',
  'faceLit',
  'faceEdge',
  'faceShade',
  'bevelLit',
  'pipEdge',
  'pipShade',
  'pipLit',
] as const
type Role = (typeof ROLES)[number]

const hslOf = (ch: string) => toHsl((usage.get(palette[ch]) as { c: RGBA }).c)
const roles: Record<string, Role> = {}

/** 1. 눈은 채도로 갈린다. 몸통은 회색조다. */
const pipCore = Object.keys(palette)
  .filter((c) => c !== TRANSPARENT_CHAR && hslOf(c).s > 0.5)
  .sort((a, b) => hslOf(a).l - hslOf(b).l)
if (pipCore.length !== 2) die(`눈 색이 2종이어야 하는데 ${pipCore.length}종입니다: ${pipCore.join(', ')}`)
roles[pipCore[0]] = 'pipShade'
roles[pipCore[1]] = 'pipLit'

/** 2. 눈에 가장 자주 맞닿는 색이 눈 테두리다. */
const core = new Set(pipCore)
const touching = new Map<string, number>()
for (const f of all) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = charAt(f.doc, x, y)
      if (ch === TRANSPARENT_CHAR || core.has(ch) || roles[ch]) continue
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx
        const ny = y + dy
        return nx >= 0 && ny >= 0 && nx < w && ny < h && core.has(charAt(f.doc, nx, ny))
      })
      if (near) touching.set(ch, (touching.get(ch) ?? 0) + 1)
    }
  }
}
const pipEdge = [...touching].sort((a, b) => b[1] - a[1])[0]?.[0]
if (!pipEdge) die('눈 테두리 색을 찾지 못했습니다.')
roles[pipEdge] = 'pipEdge'

/** 3. 투명과 가장 많이 맞닿는 색이 외곽선이다. */
const edgeShare = new Map<string, { edge: number; total: number }>()
for (const f of all) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = charAt(f.doc, x, y)
      if (ch === TRANSPARENT_CHAR || roles[ch]) continue
      const hit = edgeShare.get(ch) ?? { edge: 0, total: 0 }
      hit.total++
      const onEdge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx
        const ny = y + dy
        return nx < 0 || ny < 0 || nx >= w || ny >= h || charAt(f.doc, nx, ny) === TRANSPARENT_CHAR
      })
      if (onEdge) hit.edge++
      edgeShare.set(ch, hit)
    }
  }
}
roles[[...edgeShare].sort((a, b) => b[1].edge / b[1].total - a[1].edge / a[1].total)[0][0]] = 'outline'

/**
 * 4. 남은 몸통 색을 등축 쪽 기준으로 가른다.
 *
 * 오른쪽 면에만 쓰이는 둘이 그늘이고, 나머지 둘이 밝은 면과 모서리다.
 * 정면 가족에만 있는 색은 여기서 잡히지 않으므로 마지막에 따로 준다.
 */
const g = geometry(iso[0].doc)
const faceAt = (x: number, y: number) =>
  Math.abs(x - g.cx) / g.halfW + Math.abs(y - g.waistY) / g.topH <= 1 ? 'top' : x < g.cx ? 'left' : 'right'

const spread = new Map<string, { top: number; left: number; right: number }>()
for (const f of iso) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = charAt(f.doc, x, y)
      if (ch === TRANSPARENT_CHAR || roles[ch]) continue
      const hit = spread.get(ch) ?? { top: 0, left: 0, right: 0 }
      hit[faceAt(x, y) as 'top' | 'left' | 'right']++
      spread.set(ch, hit)
    }
  }
}
const rest = [...spread.keys()]
if (rest.length !== 4) die(`등축 몸통 색이 4종이어야 하는데 ${rest.length}종입니다: ${rest.join(', ')}`)

const rightOnly = rest
  .filter((ch) => {
    const s = spread.get(ch) as { top: number; left: number; right: number }
    return s.right / (s.top + s.left + s.right) > 0.9
  })
  .sort((a, b) => hslOf(a).l - hslOf(b).l)
if (rightOnly.length !== 2) die(`오른쪽 면 전용 색이 2종이어야 하는데 ${rightOnly.length}종입니다.`)
roles[rightOnly[0]] = 'faceShade'
roles[rightOnly[1]] = 'faceEdge'

const lit = rest.filter((ch) => !roles[ch]).sort((a, b) => hslOf(a).l - hslOf(b).l)
roles[lit[0]] = 'faceLit'
roles[lit[1]] = 'edge'

/** 5. 정면 가족에만 있는 색. 위쪽 밝은 모서리다. */
const leftover = Object.keys(palette).filter((c) => c !== TRANSPARENT_CHAR && !roles[c])
if (leftover.length !== 1) {
  die(`정면 전용 색이 1종이어야 하는데 ${leftover.length}종입니다: ${leftover.join(', ')}`)
}
roles[leftover[0]] = 'bevelLit'

console.error('역할: ' + Object.entries(roles).map(([c, r]) => `${c}=${r}`).join(' '))

// ---- 눈 세기 ------------------------------------------------------------

const pipChars = new Set([pipCore[0], pipCore[1]])

/** 등축은 세 면에 눈이 흩어져 있다. 면마다 따로 센다. */
function isoPips(doc: PixelDoc): [number, number, number] {
  const seen = new Uint8Array(w * h)
  const counts: [number, number, number] = [0, 0, 0]
  const index = { top: 0, left: 1, right: 2 } as const
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (seen[y * w + x] || !pipChars.has(charAt(doc, x, y))) continue
      const votes = [0, 0, 0]
      const stack: Array<[number, number]> = [[x, y]]
      seen[y * w + x] = 1
      while (stack.length) {
        const [px, py] = stack.pop() as [number, number]
        votes[index[faceAt(px, py) as 'top' | 'left' | 'right']]++
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = px + dx
          const ny = py + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx]) continue
          if (!pipChars.has(charAt(doc, nx, ny))) continue
          seen[ny * w + nx] = 1
          stack.push([nx, ny])
        }
      }
      // 덩어리가 덮은 칸들의 다수결. 한 점만 보면 면 경계에 걸린 눈이 흔들린다.
      counts[votes.indexOf(Math.max(...votes))]++
    }
  }
  return counts
}

/** 정면은 한 면뿐이라 덩어리 수가 곧 눈 수다. */
function facePips(doc: PixelDoc): number {
  const seen = new Uint8Array(w * h)
  let n = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (seen[y * w + x] || !pipChars.has(charAt(doc, x, y))) continue
      n++
      const stack: Array<[number, number]> = [[x, y]]
      seen[y * w + x] = 1
      while (stack.length) {
        const [px, py] = stack.pop() as [number, number]
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = px + dx
          const ny = py + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx]) continue
          if (!pipChars.has(charAt(doc, nx, ny))) continue
          seen[ny * w + nx] = 1
          stack.push([nx, ny])
        }
      }
    }
  }
  return n
}

const isoBlocks: string[] = []
for (const f of iso) {
  const pips = isoPips(f.doc)
  if (pips[0] !== f.top) die(`${f.file}: 윗면이 ${f.top} 이어야 하는데 ${pips[0]} 개가 세어집니다.`)
  // 마주보는 면의 합은 7이다. 세 면이 (1,6) (2,5) (3,4) 에서 하나씩이어야 한다.
  if (new Set(pips.map((v) => Math.min(v, 7 - v))).size !== 3 || pips.some((v) => v < 1 || v > 6)) {
    die(`${f.file}: 눈 배치 ${pips.join('/')} 는 실제 주사위에 없는 조합입니다.`)
  }
  console.error(`${f.file}  위 ${pips[0]} · 왼쪽 ${pips[1]} · 오른쪽 ${pips[2]}`)
  isoBlocks.push(
    `  ${f.top}: {\n    pips: [${pips.join(', ')}],\n    rows: [\n` +
      rowsOf(f.doc).map((r) => `      '${r}',`).join('\n') +
      '\n    ],\n  },',
  )
}

const faceBlocks: string[] = []
for (const f of face) {
  const n = facePips(f.doc)
  if (n !== f.top) die(`${f.file}: 눈이 ${f.top} 개여야 하는데 ${n} 개가 세어집니다.`)
  console.error(`${f.file}  눈 ${n}`)
  faceBlocks.push(
    `  ${f.top}: {\n    pips: [${f.top}, 0, 0],\n    rows: [\n` +
      rowsOf(f.doc).map((r) => `      '${r}',`).join('\n') +
      '\n    ],\n  },',
  )
}

// ---- 출력 ---------------------------------------------------------------

const out = `// 생성된 파일입니다. 손으로 고치지 마세요.
// npx tsx tools/build-frames.mts frames
//
// 사람이 그린 참고 주사위에서 뜬 형태입니다. 생성기는 이 형태를 그대로 쓰고
// 팔레트만 갈아끼웁니다 — 그래야 눈 모양이 달라지지 않습니다.
//
// 등축 여섯 장과 정면 여섯 장이 팔레트를 **함께** 씁니다. 따로 매기면 같은
// 회색이 어떤 장에서는 c, 다른 장에서는 d 가 되어 배색 하나를 열두 장에 똑같이
// 입힐 수 없습니다.
//
// rows 는 반복을 접은 표기입니다. 'a~10' 은 a 가 10칸 이어진다는 뜻입니다.
// unpackRows(rows, DICE_FRAME_SIZE.w) 로 펼칩니다.

export const DICE_FRAME_SIZE = { w: ${w}, h: ${h} } as const

/** 문자 -> "#rrggbb" | "transparent". 열두 장이 함께 씁니다. */
export const DICE_PALETTE: Record<string, string> = ${JSON.stringify(palette, null, 2)}

/**
 * 각 문자가 무엇인지. 몸통과 눈을 따로 바꾸려면 이것이 있어야 합니다.
 *
 * outline    실루엣 외곽선
 * edge       밝은 모서리 (면과 면 사이, 외곽선 안쪽)
 * faceLit    윗면과 왼쪽면 / 정면의 본체
 * faceEdge   등축 오른쪽면 모서리
 * faceShade  등축 오른쪽면 (그늘) / 정면의 아래·오른쪽 경사
 * bevelLit   정면 위쪽의 밝은 경사
 * pipEdge    눈 테두리 (파인 자국)
 * pipShade   눈 어두운 쪽
 * pipLit     눈 밝은 쪽
 */
export type DiceRole =
${ROLES.map((r) => `  | '${r}'`).join('\n')}

export const DICE_ROLE_OF: Record<string, DiceRole> = ${JSON.stringify(roles, null, 2)}

export interface DiceFrame {
  /** 보이는 면의 눈. 등축은 위/왼쪽/오른쪽, 정면은 앞면 하나뿐이라 뒤 둘이 0 입니다. */
  pips: [number, number, number]
  rows: string[]
}

/** 등축. 윗면 눈 개수로 찾습니다. */
export const DICE_FRAMES: Record<number, DiceFrame> = {
${isoBlocks.join('\n')}
}

/** 정면. 앞면 눈 개수로 찾습니다. */
export const FACE_FRAMES: Record<number, DiceFrame> = {
${faceBlocks.join('\n')}
}
`

const target = 'src/core/generate/diceFrames.ts'
writeFileSync(target, out, 'utf8')
console.error(`\n${target} — 등축 ${iso.length} + 정면 ${face.length}, 팔레트 ${ordered.length}색`)
