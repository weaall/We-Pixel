/**
 * 참고 주사위 PNG 를 기본 프레임 모듈로 굽는다.
 *
 *   npx tsx tools/build-frames.mts <폴더>
 *
 * 폴더에 1.png ... 6.png 를 둔다. 파일 이름의 숫자가 윗면 눈이다.
 *
 * 절차적으로 그린 주사위는 사람이 그린 것과 같아질 수 없다. 그래서 형태는
 * 그리지 않고 받아 둔다 — 이 모듈이 그 형태다. 생성기는 팔레트만 갈아끼운다.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RGBA } from '../src/core/color'
import { toHex } from '../src/core/color'
import { packRow } from '../src/core/codec'
import { getPixel } from '../src/core/doc'
import type { PixelDoc } from '../src/core/doc'
import { decodePng } from '../src/import/pngDecode'
import { toLogicalGrid } from '../src/core/resample'

const dir = process.argv[2]
if (!dir) {
  console.error('사용법: npx tsx tools/build-frames.mts <폴더>')
  process.exit(1)
}

const files = readdirSync(dir)
  .filter((f) => /^[1-6]\.png$/i.test(f))
  .sort()
if (files.length === 0) {
  console.error(`${dir} 에 1.png ~ 6.png 가 없습니다.`)
  process.exit(1)
}

const frames = files.map((file) => {
  const raw = decodePng(readFileSync(join(dir, file)))
  const { doc, scale } = toLogicalGrid(raw)
  return { top: Number(file[0]), file, raw, doc, scale }
})

const { w, h } = frames[0].doc
for (const f of frames) {
  if (f.doc.w !== w || f.doc.h !== h) {
    console.error(`크기가 섞였습니다: ${f.file} 은 ${f.doc.w}x${f.doc.h} 인데 앞의 것은 ${w}x${h} 입니다.`)
    process.exit(1)
  }
}

const TRANSPARENT_CHAR = '.'
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const keyOf = (c: RGBA) => (c[3] === 0 ? TRANSPARENT_CHAR : toHex(c))

/**
 * 팔레트를 여섯 장이 함께 쓴다.
 *
 * 장마다 따로 매기면 같은 회색이 1.png 에서는 c, 4.png 에서는 d 가 된다.
 * 그러면 배색 하나를 여섯 장에 똑같이 입힐 수 없다.
 */
const usage = new Map<string, { n: number; c: RGBA }>()
for (const f of frames) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = getPixel(f.doc, x, y)
    if (c[3] === 0) continue
    const hit = usage.get(keyOf(c))
    if (hit) hit.n++
    else usage.set(keyOf(c), { n: 1, c })
  }
}
const ordered = [...usage.entries()].sort((a, b) => b[1].n - a[1].n)
if (ordered.length > ALPHABET.length) {
  console.error(`색이 ${ordered.length}종으로 너무 많습니다 (최대 ${ALPHABET.length}).`)
  process.exit(1)
}
const charOf = new Map<string, string>()
const palette: Record<string, string> = {}
ordered.forEach(([hex], i) => {
  charOf.set(hex, ALPHABET[i])
  palette[ALPHABET[i]] = hex
})
palette[TRANSPARENT_CHAR] = 'transparent'

function rowsOf(doc: PixelDoc): string[] {
  const rows: string[] = []
  for (let y = 0; y < h; y++) {
    let row = ''
    for (let x = 0; x < w; x++) {
      const c = getPixel(doc, x, y)
      row += c[3] === 0 ? TRANSPARENT_CHAR : (charOf.get(keyOf(c)) as string)
    }
    rows.push(packRow(row))
  }
  return rows
}

// ---- 면별 눈 세기 -------------------------------------------------------

const PIP_HEX = new Set(
  // 붉은 계열 = 눈. 몸통은 회색이다.
  ordered.filter(([hex]) => {
    const [r, g, b] = charOf.has(hex) ? (usage.get(hex) as { c: RGBA }).c : [0, 0, 0]
    return r > g + 24 && r > b + 24
  }).map(([hex]) => hex),
)

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
  return {
    cx: (waist.min + waist.max) / 2,
    halfW: width / 2,
    waistY: waist.y,
    topH: waist.y - spans[0].y,
  }
}

function countPips(doc: PixelDoc): [number, number, number] {
  const g = geometry(doc)
  // 위면은 마름모다: |dx|/a + |dy|/b <= 1
  const faceAt = (x: number, y: number) =>
    Math.abs(x - g.cx) / g.halfW + Math.abs(y - g.waistY) / g.topH <= 1 ? 0 : x < g.cx ? 1 : 2

  const seen = new Uint8Array(w * h)
  const counts: [number, number, number] = [0, 0, 0]
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (seen[y * w + x] || !PIP_HEX.has(keyOf(getPixel(doc, x, y)))) continue
    const votes = [0, 0, 0]
    const stack: Array<[number, number]> = [[x, y]]
    seen[y * w + x] = 1
    while (stack.length) {
      const [px, py] = stack.pop() as [number, number]
      votes[faceAt(px, py)]++
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx
        const ny = py + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        if (seen[ny * w + nx] || !PIP_HEX.has(keyOf(getPixel(doc, nx, ny)))) continue
        seen[ny * w + nx] = 1
        stack.push([nx, ny])
      }
    }
    // 덩어리가 덮은 칸들의 다수결. 한 점만 보면 면 경계에 걸린 눈이 흔들린다.
    counts[votes.indexOf(Math.max(...votes))]++
  }
  return counts
}

// ---- 출력 ---------------------------------------------------------------

const blocks: string[] = []
for (const f of frames) {
  const pips = countPips(f.doc)
  if (pips[0] !== f.top) {
    console.error(`${f.file}: 윗면이 ${f.top} 이어야 하는데 ${pips[0]} 개가 세어집니다.`)
    process.exit(1)
  }
  // 마주보는 면의 합은 7이다. 세 면이 (1,6) (2,5) (3,4) 에서 하나씩이어야 한다.
  const pairs = new Set(pips.map((v) => Math.min(v, 7 - v)))
  if (pairs.size !== 3 || pips.some((v) => v < 1 || v > 6)) {
    console.error(`${f.file}: 눈 배치 ${pips.join('/')} 는 실제 주사위에 없는 조합입니다.`)
    process.exit(1)
  }
  console.error(
    `${f.file}  ${f.raw.w}x${f.raw.h} -> ${w}x${h} (${f.scale}배)  ` +
      `위 ${pips[0]} · 왼쪽 ${pips[1]} · 오른쪽 ${pips[2]}`,
  )
  blocks.push(
    `  ${f.top}: {\n    pips: [${pips.join(', ')}],\n    rows: [\n` +
      rowsOf(f.doc).map((r) => `      '${r}',`).join('\n') +
      '\n    ],\n  },',
  )
}

const out = `// 생성된 파일입니다. 손으로 고치지 마세요.
// npx tsx tools/build-frames.mts frames
//
// 사람이 그린 참고 주사위에서 뜬 형태입니다. 생성기는 이 형태를 그대로 쓰고
// 팔레트만 갈아끼웁니다 — 그래야 눈 모양이 달라지지 않습니다.
//
// 여섯 장이 팔레트를 함께 씁니다. 장마다 따로 매기면 같은 회색이 어떤 장에서는
// c, 다른 장에서는 d 가 되어 배색 하나를 여섯 장에 똑같이 입힐 수 없습니다.
//
// rows 는 반복을 접은 표기입니다. 'a~10' 은 a 가 10칸 이어진다는 뜻입니다.
// unpackRows(rows, DICE_FRAME_SIZE.w) 로 펼칩니다.

export const DICE_FRAME_SIZE = { w: ${w}, h: ${h} } as const

/** 문자 -> "#rrggbb" | "transparent". 모든 프레임이 함께 씁니다. */
export const DICE_PALETTE: Record<string, string> = ${JSON.stringify(palette, null, 2).replace(/\n/g, '\n')}

export interface DiceFrame {
  /** 보이는 세 면의 눈: 위, 왼쪽, 오른쪽. */
  pips: [number, number, number]
  rows: string[]
}

/** 윗면 눈 개수로 찾습니다. */
export const DICE_FRAMES: Record<number, DiceFrame> = {
${blocks.join('\n')}
}
`

const target = 'src/core/generate/diceFrames.ts'
writeFileSync(target, out, 'utf8')
console.error(`\n${target} — ${frames.length}개 프레임, 팔레트 ${ordered.length}색`)
