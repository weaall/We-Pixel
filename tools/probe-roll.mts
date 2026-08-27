/**
 * 제미나이가 주사위 회전 칸을 그릴 수 있는지 시험한다.
 *
 *   GEMINI_API_KEY=... npx tsx tools/probe-roll.mts [칸수]
 *
 * 답을 눈으로 보고 판단하지 않는다. 회전한 큐브라면 반드시 지켜야 하는 것들을
 * 세어서 통과/실패로 낸다:
 *
 *  1. 칸 수와 행 수, 행 길이가 맞는가
 *  2. 팔레트에 없는 문자를 쓰지 않았는가
 *  3. 실루엣이 한 덩어리인가 (조각나면 큐브가 아니다)
 *  4. 칸마다 실제로 달라지는가 (같은 그림을 복사했으면 회전이 아니다)
 *  5. 실루엣 넓이가 들쭉날쭉하지 않은가 (회전하는 큐브는 넓이가 완만하게 변한다)
 */
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateObject } from 'ai'
import { z } from 'zod'
import { unpackRow, unpackRows } from '../src/core/codec'
import { DICE_FRAMES, DICE_FRAME_SIZE, DICE_PALETTE } from '../src/core/generate/diceFrames'
import { DICE_ROLE_LIST } from '../src/core/generate/diceSet'

const key = process.env.GEMINI_API_KEY
if (!key) {
  console.error('GEMINI_API_KEY 가 없습니다. 셸에 넣고 다시 실행하세요.')
  process.exit(1)
}
const wanted = Math.max(2, Number(process.argv[2] ?? 12))
const { w, h } = DICE_FRAME_SIZE

const schema = z.object({
  frames: z
    .array(z.object({ rows: z.array(z.string()) }))
    .describe('회전하는 칸들. 각 rows 는 접힌 표기의 행 목록.'),
})

const roles = DICE_ROLE_LIST.map((e) => `  ${e.char} = ${e.role}`).join('\n')
const sample = DICE_FRAMES[6].rows.join('\n')

const system = [
  '당신은 픽셀 아트로 등축(아이소메트릭) 주사위를 그립니다.',
  '',
  '행은 반복을 접은 표기입니다. "a~10" 은 a 가 10칸 이어진다는 뜻입니다.',
  '"." 은 투명입니다.',
  '',
  '문자와 역할:',
  roles,
  '',
  '규칙:',
  `- 각 칸은 정확히 ${h} 행이고, 펼친 각 행은 정확히 ${w} 칸입니다.`,
  '- 위 문자만 씁니다. 새 문자를 만들지 마세요.',
  '- 실루엣은 끊기지 않은 한 덩어리여야 합니다.',
].join('\n')

const prompt = [
  `아래는 64x64 등축 주사위 한 장입니다 (눈 6/2/3):`,
  '',
  sample,
  '',
  `이 주사위가 굴러가며 회전하는 ${wanted} 칸을 그려 주세요.`,
  '칸마다 큐브가 조금씩 돌아 면의 모양과 실루엣이 달라져야 합니다.',
  '색만 바꾸거나 같은 그림을 반복하면 안 됩니다.',
].join('\n')

console.log(`요청: ${wanted}칸, ${w}x${h}`)
const started = Date.now()
let out
try {
  out = await generateObject({
    model: createGoogleGenerativeAI({ apiKey: key })('gemini-3.6-flash'),
    schema,
    system,
    prompt,
    temperature: 0.7,
  })
} catch (err) {
  console.error('호출 실패:', err instanceof Error ? err.message.slice(0, 300) : String(err))
  process.exit(1)
}
console.log(`응답 ${((Date.now() - started) / 1000).toFixed(1)}초`)

const known = new Set(Object.keys(DICE_PALETTE))
const results = out.object.frames.map((f, i) => {
  const problems: string[] = []
  if (f.rows.length !== h) problems.push(`행 ${f.rows.length}개 (${h}개여야 함)`)

  let grid: string[] | null = null
  try {
    grid = unpackRows(f.rows.slice(0, h), w)
  } catch (err) {
    problems.push(`펼치기 실패: ${err instanceof Error ? err.message.slice(0, 80) : ''}`)
  }

  let area = 0
  let components = 0
  if (grid && grid.length === h) {
    const bad = new Set<string>()
    for (const row of grid) for (const ch of row) if (!known.has(ch)) bad.add(ch)
    if (bad.size > 0) problems.push(`모르는 문자 ${[...bad].join('')}`)

    const seen = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (grid[y][x] === '.' || seen[y * w + x]) continue
      components++
      const stack: Array<[number, number]> = [[x, y]]
      seen[y * w + x] = 1
      while (stack.length) {
        const [px, py] = stack.pop()!
        area++
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = px + dx
          const ny = py + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx]) continue
          if (grid[ny][nx] === '.') continue
          seen[ny * w + nx] = 1
          stack.push([nx, ny])
        }
      }
    }
    if (components !== 1) problems.push(`실루엣이 ${components}조각`)
  }

  return { i, problems, area, key: grid?.join('') ?? `실패${i}` }
})

console.log('\n칸  넓이   문제')
for (const r of results) {
  console.log(`${String(r.i).padStart(2)}  ${String(r.area).padStart(5)}  ${r.problems.join(' · ') || '-'}`)
}

const clean = results.filter((r) => r.problems.length === 0)
const unique = new Set(results.map((r) => r.key)).size
const areas = clean.map((r) => r.area)
const jump =
  areas.length > 1
    ? Math.max(...areas.slice(1).map((a, i) => Math.abs(a - areas[i]) / Math.max(1, areas[i])))
    : 1

console.log('\n--- 판정 ---')
const checks: Array<[string, boolean, string]> = [
  ['칸 수', out.object.frames.length === wanted, `${out.object.frames.length}/${wanted}`],
  ['형식이 맞는 칸', clean.length === results.length, `${clean.length}/${results.length}`],
  ['칸마다 다름', unique === results.length, `${unique}/${results.length} 종류`],
  ['넓이가 완만함', jump < 0.25, `최대 변화 ${(jump * 100).toFixed(0)}%`],
]
for (const [name, ok, detail] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  — ${detail}`)
}
const passed = checks.every(([, ok]) => ok)
console.log(`\n${passed ? '회전 칸을 만들 수 있습니다.' : '회전 칸을 만들지 못합니다.'}`)
process.exit(passed ? 0 : 1)
