/**
 * 참고 버튼 PNG 를 프레임 모듈로 굽는다.
 *
 *   npx tsx tools/build-buttons.mts frames/button.png
 *
 * 버튼은 9-슬라이스다. 가운데가 반복되므로 한 장으로 어떤 크기든 만든다.
 * 32/64/96 을 따로 들고 갈 이유가 없다.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { toHsl } from '../src/core/color'
import type { PixelSpec } from '../src/core/codec'
import { toSpec } from '../src/core/codec'
import { decodePng } from '../src/import/pngDecode'
import { toLogicalGrid } from '../src/core/resample'

const file = process.argv[2] ?? 'frames/button.png'
const spec = toSpec(toLogicalGrid(decodePng(readFileSync(file))).doc)

/**
 * 늘어나는 가운데를 찾는다.
 *
 * 가운데가 되려면 그 구간의 모든 줄이 서로 같아야 한다 — 한 줄만 복사해도 같은
 * 그림이 나온다는 뜻이다. 캡은 작을수록 좋다. 크게 잡으면 늘릴 수 있는 폭이
 * 좁아지고, 작은 버튼에서 캡끼리 겹친다.
 */
function findBand(lines: string[]): { head: number; tail: number } | null {
  for (let head = 1; head < lines.length / 2; head++) {
    for (let tail = 1; tail < lines.length / 2; tail++) {
      const from = head
      const to = lines.length - tail - 1
      if (to - from < 1) continue
      let uniform = true
      for (let i = from + 1; i <= to; i++) {
        if (lines[i] !== lines[from]) {
          uniform = false
          break
        }
      }
      if (uniform) return { head, tail }
    }
  }
  return null
}

const cols: string[] = []
for (let x = 0; x < spec.w; x++) cols.push(spec.rows.map((r) => r[x]).join(''))

const h = findBand(cols)
const v = findBand(spec.rows)
if (!h) {
  console.error('가로로 늘어나는 가운데를 찾지 못했습니다. 9-슬라이스가 아닙니다.')
  process.exit(1)
}
const border = {
  left: h.head,
  right: h.tail,
  top: v ? v.head : 0,
  bottom: v ? v.tail : 0,
}
console.error(
  `${file}  ${spec.w}x${spec.h}  캡: 왼쪽 ${border.left} 오른쪽 ${border.right} ` +
    `위 ${border.top} 아래 ${border.bottom}`,
)

// ---- 역할 판별 ----------------------------------------------------------

const ROLES = ['halo', 'outline', 'bevelLit', 'face', 'bevelShade'] as const
type Role = (typeof ROLES)[number]

const chars = Object.keys(spec.palette).filter((c) => c !== '.')
const at = (x: number, y: number) =>
  x < 0 || y < 0 || x >= spec.w || y >= spec.h ? '.' : spec.rows[y][x]

const stat = new Map<string, { total: number; nearVoid: number }>()
for (const ch of chars) stat.set(ch, { total: 0, nearVoid: 0 })
for (let y = 0; y < spec.h; y++) {
  for (let x = 0; x < spec.w; x++) {
    const ch = at(x, y)
    const s = stat.get(ch)
    if (!s) continue
    s.total++
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) === '.')) {
      s.nearVoid++
    }
  }
}

const roles: Record<string, Role> = {}
const lightOf = (ch: string) => toHsl(hexToRgba(spec.palette[ch])).l

function hexToRgba(hex: string): [number, number, number, number] {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16)
  return [n(1), n(3), n(5), 255]
}

// 1. 투명과 가장 많이 맞닿는 색이 바깥 테두리다.
const halo = [...stat].sort(
  (a, b) => b[1].nearVoid / b[1].total - a[1].nearVoid / a[1].total,
)[0][0]
roles[halo] = 'halo'

// 2. 그 다음으로 halo 에 가장 많이 맞닿는 색이 외곽선이다.
const touchHalo = new Map<string, number>()
for (let y = 0; y < spec.h; y++) {
  for (let x = 0; x < spec.w; x++) {
    const ch = at(x, y)
    if (ch === '.' || roles[ch]) continue
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) === halo)) {
      touchHalo.set(ch, (touchHalo.get(ch) ?? 0) + 1)
    }
  }
}
const outline = [...touchHalo].sort((a, b) => b[1] - a[1])[0]?.[0]
if (!outline) {
  console.error('외곽선을 찾지 못했습니다.')
  process.exit(1)
}
roles[outline] = 'outline'

// 3. 남은 셋: 가장 넓은 것이 본체, 나머지는 밝기로 위/아래 경사다.
const rest = chars.filter((c) => !roles[c])
if (rest.length !== 3) {
  console.error(`본체 색이 3종이어야 하는데 ${rest.length}종입니다: ${rest.join(', ')}`)
  process.exit(1)
}
const face = [...rest].sort((a, b) => (stat.get(b)?.total ?? 0) - (stat.get(a)?.total ?? 0))[0]
roles[face] = 'face'
const bevels = rest.filter((c) => c !== face).sort((a, b) => lightOf(a) - lightOf(b))
roles[bevels[0]] = 'bevelShade'
roles[bevels[1]] = 'bevelLit'

console.error('역할: ' + Object.entries(roles).map(([c, r]) => `${c}=${r}`).join(' '))

// ---- 출력 ---------------------------------------------------------------

const out = `// 생성된 파일입니다. 손으로 고치지 마세요.
// npx tsx tools/build-buttons.mts ${file}
//
// 사람이 그린 참고 버튼에서 뜬 형태입니다. 9-슬라이스라 가운데를 늘려 어떤
// 크기든 만듭니다 — 32/64/96 을 따로 들고 갈 필요가 없습니다.

export const BUTTON_SIZE = { w: ${spec.w}, h: ${spec.h} } as const

/** 늘리지 않고 그대로 두는 가장자리 폭. 유니티의 spriteBorder 와 같은 뜻입니다. */
export const BUTTON_BORDER = ${JSON.stringify(border)} as const

/** 문자 -> "#rrggbb" | "transparent". */
export const BUTTON_PALETTE: Record<string, string> = ${JSON.stringify(spec.palette, null, 2)}

/**
 * 각 문자가 무엇인지.
 *
 * halo        바깥 테두리 (투명과 맞닿는 한 겹)
 * outline     외곽선
 * bevelLit    왼쪽 위 경사 (빛을 받는 쪽)
 * face        본체
 * bevelShade  오른쪽 아래 경사 (그늘)
 */
export type ButtonRole = ${ROLES.map((r) => `'${r}'`).join(' | ')}

export const BUTTON_ROLE_OF: Record<string, ButtonRole> = ${JSON.stringify(roles, null, 2)}

/** 접지 않은 행. 가로세로로 늘려 쓰는 원본입니다. */
export const BUTTON_ROWS: string[] = [
${spec.rows.map((r) => `  '${r}',`).join('\n')}
]
`

const target = 'src/core/generate/buttonFrame.ts'
writeFileSync(target, out, 'utf8')
console.error(`\n${target} — ${spec.w}x${spec.h}, 팔레트 ${chars.length}색`)
