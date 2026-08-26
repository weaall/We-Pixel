/**
 * 참고 주사위 PNG 를 기본 프레임 모듈로 굽는다.
 *
 *   npx tsx tools/build-frames.mts <폴더>
 *
 * 폴더에 blank.png, 1.png ... 6.png 를 둔다. 파일 이름의 숫자가 윗면 눈이다.
 *
 * 절차적으로 그린 주사위는 사람이 그린 것과 같아질 수 없다. 그래서 형태는
 * 그리지 않고 받아 둔다 — 이 모듈이 그 형태다. 생성기는 팔레트만 갈아끼운다.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { packRows, toSpec } from '../src/core/codec'
import { toLogicalGrid } from '../src/core/resample'
import { decodePng } from '../src/import/pngDecode'

const dir = process.argv[2]
if (!dir) {
  console.error('사용법: npx tsx tools/build-frames.mts <폴더>')
  process.exit(1)
}

const entries: Array<{ key: string; file: string }> = []
for (const file of readdirSync(dir).sort()) {
  if (!file.toLowerCase().endsWith('.png')) continue
  const stem = file.replace(/\.png$/i, '')
  const pip = stem.match(/^([1-6])$/)
  entries.push({ key: pip ? pip[1] : stem.toLowerCase(), file })
}
if (entries.length === 0) {
  console.error(`${dir} 에 PNG 가 없습니다.`)
  process.exit(1)
}

const blocks: string[] = []
let size: string | null = null

for (const { key, file } of entries) {
  const raw = decodePng(readFileSync(join(dir, file)))
  // 저장은 64x64 여도 실제 격자가 32x32 인 경우가 흔하다. 그대로 두면 편집 때 어긋난다.
  const { doc, scale } = toLogicalGrid(raw)
  const spec = toSpec(doc)

  const dims = `${spec.w}x${spec.h}`
  if (size === null) size = dims
  else if (size !== dims) {
    console.error(`크기가 섞였습니다: ${file} 은 ${dims} 인데 앞의 것은 ${size} 입니다.`)
    process.exit(1)
  }

  console.error(
    `${file.padEnd(12)} ${raw.w}x${raw.h} -> ${dims} (${scale}배)  ` +
      `색 ${Object.keys(spec.palette).length}종`,
  )

  blocks.push(
    `  ${/^[1-6]$/.test(key) ? `'${key}'` : key}: {\n` +
      `    palette: ${JSON.stringify(spec.palette)},\n` +
      `    rows: [\n${packRows(spec).map((r) => `      '${r}',`).join('\n')}\n    ],\n` +
      `  },`,
  )
}

const [w, h] = (size ?? '32x32').split('x')
const out = `// 생성된 파일입니다. 손으로 고치지 마세요.
// npx tsx tools/build-frames.mts <폴더>
//
// 사람이 그린 참고 주사위에서 뜬 형태입니다. 생성기는 이 형태를 그대로 쓰고
// 팔레트만 갈아끼웁니다 — 그래야 눈 모양이 달라지지 않습니다.
//
// 행은 반복을 접은 표기입니다. 'a~10' 은 a 가 10칸 이어진다는 뜻입니다.

export const DICE_FRAME_SIZE = { w: ${w}, h: ${h} } as const

export interface DiceFrame {
  palette: Record<string, string>
  /** 접힌 행. unpackRows(rows, DICE_FRAME_SIZE.w) 로 펼칩니다. */
  rows: string[]
}

export const DICE_FRAMES: Record<string, DiceFrame> = {
${blocks.join('\n')}
}
`

const target = 'src/core/generate/diceFrames.ts'
writeFileSync(target, out, 'utf8')
console.error(`\n${target} 에 ${entries.length}개 프레임을 썼습니다.`)
