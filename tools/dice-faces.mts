/**
 * 참고 주사위에서 면별 눈 수를 뽑는다.
 *
 *   npx tsx tools/dice-faces.mts <파일...>
 */
import { readFileSync } from 'node:fs'
import type { RGBA } from '../src/core/color'
import { toHex } from '../src/core/color'
import { createDoc, getPixel, setPixel } from '../src/core/doc'
import type { PixelDoc } from '../src/core/doc'
import { decodePng } from '../src/import/pngDecode'
import { toLogicalGrid } from '../src/core/resample'

const PIP = new Set(['#650020', '#860327'])
const key = (c: RGBA) => (c[3] === 0 ? '.' : toHex(c))

const files = process.argv.slice(2)
const docs = files.map((f) => toLogicalGrid(decodePng(readFileSync(f))).doc)
const { w, h } = docs[0]

/**
 * 눈이 없는 몸통.
 *
 * 칸마다 붉은 계열을 뺀 뒤 가장 흔한 색을 고른다. 붉은색을 남기면 여러 장이
 * 공유하는 눈 자리가 다수결에서 이겨 몸통에 섞인다.
 */
const body: PixelDoc = createDoc(w, h)
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const counts = new Map<string, { n: number; c: RGBA }>()
    for (const d of docs) {
      const c = getPixel(d, x, y)
      if (PIP.has(key(c))) continue
      const hit = counts.get(key(c))
      if (hit) hit.n++
      else counts.set(key(c), { n: 1, c })
    }
    let best: RGBA = [0, 0, 0, 0]
    let bestN = 0
    for (const { n, c } of counts.values()) if (n > bestN) { bestN = n; best = c }
    setPixel(body, x, y, best)
  }
}

/**
 * 큐브 꼭짓점. 실루엣이 넓어지다 멈추는 줄이 좌우 꼭짓점이다.
 *
 * 색으로 면을 가르려 했지만 안 된다. 면마다 명암이 여러 단계라 대표색 하나로는
 * 잡히지 않고, 눈이 놓인 자리는 몸통 색이 아예 없는 경우도 있다.
 */
function cubeGeometry(doc: PixelDoc) {
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
  const top = spans[0].y
  const widest = spans.reduce((a, b) => (b.max - b.min > a.max - a.min ? b : a))
  // 가장 넓은 줄이 여럿이면 그 중 가장 위가 좌우 꼭짓점이다.
  const waist = spans.find((s) => s.max - s.min === widest.max - widest.min)!.y
  const cx = (widest.min + widest.max) / 2
  return { top, waist, cx, halfW: (widest.max - widest.min) / 2, topH: waist - top }
}

const geo = cubeGeometry(body)

/** 위면 마름모 안인지. 마름모는 |dx|/a + |dy|/b <= 1 이다. */
function faceAt(x: number, y: number): string {
  const inTop = Math.abs(x - geo.cx) / geo.halfW + Math.abs(y - geo.waist) / geo.topH <= 1
  if (inTop) return '위'
  return x < geo.cx ? '왼쪽' : '오른쪽'
}

console.log(
  `큐브: 꼭대기 y=${geo.top}, 좌우 꼭짓점 y=${geo.waist}, 중심 x=${geo.cx}, ` +
    `반너비 ${geo.halfW}, 위면 높이 ${geo.topH}`,
)

function pips(doc: PixelDoc) {
  const seen = new Uint8Array(w * h)
  const out: Array<{ face: string; n: number }> = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (seen[y * w + x] || !PIP.has(key(getPixel(doc, x, y)))) continue
    const cells: Array<[number, number]> = []
    const stack: Array<[number, number]> = [[x, y]]
    seen[y * w + x] = 1
    while (stack.length) {
      const [px, py] = stack.pop()!
      cells.push([px, py])
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx
        const ny = py + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        if (seen[ny * w + nx] || !PIP.has(key(getPixel(doc, nx, ny)))) continue
        seen[ny * w + nx] = 1
        stack.push([nx, ny])
      }
    }
    // 덩어리가 덮은 칸들의 다수결. 한 점만 보면 면 경계에 걸린 눈이 흔들린다.
    const votes = new Map<string, number>()
    for (const [px, py] of cells) {
      const f = faceAt(px, py)
      votes.set(f, (votes.get(f) ?? 0) + 1)
    }
    let face = '?'
    let bestN = 0
    for (const [f, n] of votes) if (n > bestN) { bestN = n; face = f }
    out.push({ face, n: cells.length })
  }
  return out
}

console.log('파일        위  왼쪽  오른쪽  합계   마주보는 면의 합이 7인가')
for (const [i, doc] of docs.entries()) {
  const found = pips(doc)
  const c = { 위: 0, 왼쪽: 0, 오른쪽: 0, '?': 0 } as Record<string, number>
  for (const p of found) c[p.face]++
  const three = [c['위'], c['왼쪽'], c['오른쪽']]
  // 세 면이 (1,6) (2,5) (3,4) 에서 하나씩이면 짝이 겹치지 않는다.
  const pairs = new Set(three.map((v) => Math.min(v, 7 - v)))
  const valid = pairs.size === 3 && three.every((v) => v >= 1 && v <= 6)
  console.log(
    `${(files[i].split(/[\/]/).pop() ?? '').padEnd(11)} ${String(c['위']).padStart(2)}  ` +
      `${String(c['왼쪽']).padStart(4)}  ${String(c['오른쪽']).padStart(6)}  ` +
      `${String(three.reduce((a, b) => a + b, 0)).padStart(4)}   ${valid ? 'O' : 'X'}` +
      (c['?'] > 0 ? `   (미분류 ${c['?']})` : ''),
  )
}
