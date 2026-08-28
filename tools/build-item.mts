/**
 * 참고 아이템 칸 PNG 를 프레임 모듈로 굽는다.
 *
 *   npx tsx tools/build-item.mts frames/item.png
 *
 * 아이템 칸은 테두리 두 색과 세로 그라데이션으로 이루어진다. 등급은 색조만
 * 옮겨 만들므로 어느 색이 테두리이고 어느 색이 몇 번째 단인지 알아야 한다.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { toSpec } from '../src/core/codec'
import { decodePng } from '../src/import/pngDecode'
import { toLogicalGrid } from '../src/core/resample'

const file = process.argv[2] ?? 'frames/item.png'
const spec = toSpec(toLogicalGrid(decodePng(readFileSync(file))).doc)
const { w, h } = spec

const die = (msg: string): never => {
  console.error(msg)
  process.exit(1)
}

const chars = Object.keys(spec.palette).filter((c) => c !== '.')
const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? '.' : spec.rows[y][x])

/**
 * 테두리는 투명과 맞닿는다.
 *
 * 그라데이션 단은 좌우 끝이 테두리에 막혀 있어 투명을 만나지 않는다. 그래서
 * 이 하나로 테두리와 속을 가를 수 있다.
 */
const touchesVoid = new Set<string>()
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const ch = at(x, y)
    if (ch === '.') continue
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) === '.')) {
      touchesVoid.add(ch)
    }
  }
}
if (touchesVoid.size !== 2) {
  die(`테두리 색이 2종이어야 하는데 ${touchesVoid.size}종입니다: ${[...touchesVoid].join(', ')}`)
}

/** 위쪽에 있는 쪽이 빛을 받는 테두리다. */
const meanY = (ch: string) => {
  let sum = 0
  let n = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (at(x, y) !== ch) continue
      sum += y
      n++
    }
  }
  return n === 0 ? 0 : sum / n
}
const frame = [...touchesVoid].sort((a, b) => meanY(a) - meanY(b))

/** 속은 위에서 아래로 단을 이룬다. 세로 위치 순서가 곧 단 번호다. */
const fill = chars.filter((c) => !touchesVoid.has(c)).sort((a, b) => meanY(a) - meanY(b))
if (fill.length < 2) die(`그라데이션 단이 2개 이상이어야 하는데 ${fill.length}개입니다.`)

const roles: Record<string, string> = {
  [frame[0]]: 'frameLit',
  [frame[1]]: 'frameShade',
}
fill.forEach((ch, i) => {
  roles[ch] = `fill${i}`
})

console.error(`${file}  ${w}x${h}  테두리 ${frame.join(',')}  단 ${fill.length}개`)
console.error('역할: ' + Object.entries(roles).map(([c, r]) => `${c}=${r}`).join(' '))

const out = `// 생성된 파일입니다. 손으로 고치지 마세요.
// npx tsx tools/build-item.mts ${file}
//
// 사람이 그린 참고 아이템 칸에서 뜬 형태입니다. 등급은 색조만 옮겨 만듭니다.

export const ITEM_SIZE = { w: ${w}, h: ${h} } as const

/** 문자 -> "#rrggbb" | "transparent". */
export const ITEM_PALETTE: Record<string, string> = ${JSON.stringify(spec.palette, null, 2)}

/**
 * 각 문자가 무엇인지.
 *
 * frameLit    위쪽 테두리 (빛을 받는 쪽)
 * frameShade  아래쪽 테두리
 * fill0..N    속을 채우는 세로 그라데이션. 0 이 가장 위입니다.
 */
export const ITEM_ROLE_OF: Record<string, string> = ${JSON.stringify(roles, null, 2)}

/** 그라데이션 단 수. */
export const ITEM_FILL_STEPS = ${fill.length}

/** 접지 않은 행. */
export const ITEM_ROWS: string[] = [
${spec.rows.map((r) => `  '${r}',`).join('\n')}
]
`

const target = 'src/core/generate/itemFrame.ts'
writeFileSync(target, out, 'utf8')
console.error(`\n${target} — ${w}x${h}, 팔레트 ${chars.length}색`)
