/**
 * 참고 그림을 넣어 실제 산출을 확인한다.
 *
 *   npx tsx tools/verify.mts <파일...>
 *
 * 확인하는 것:
 *  1) PNG -> spec -> PNG 왕복이 한 바이트도 안 틀리는가
 *  2) 색 변형이 배치를 그대로 두는가 (칸마다 어느 칸과 같은 색인지가 같은가)
 */
import { readFileSync } from 'node:fs'
import { fromSpec, toSpec } from '../src/core/codec'
import type { PixelDoc } from '../src/core/doc'
import { defaultVariantSetOptions, makeVariants } from '../src/core/generate/variants'
import { toLogicalGrid } from '../src/core/resample'
import { decodePng } from '../src/import/pngDecode'

/** 문자 이름을 지운 배치. "어느 칸끼리 같은 색인가" 만 남는다. */
function shapeOf(rows: ReadonlyArray<string>): string {
  const seen = new Map<string, number>()
  return rows
    .map((row) =>
      [...row]
        .map((ch) => {
          if (!seen.has(ch)) seen.set(ch, seen.size)
          return seen.get(ch)
        })
        .join(','),
    )
    .join('|')
}

const same = (a: PixelDoc, b: PixelDoc) =>
  a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i])

let failures = 0
for (const file of process.argv.slice(2)) {
  const raw = decodePng(readFileSync(file))
  const { doc, scale } = toLogicalGrid(raw)
  const spec = toSpec(doc)
  const name = file.split(/[\/]/).pop()

  console.log(`\n### ${name}  ${raw.w}x${raw.h} -> ${spec.w}x${spec.h} (${scale}배)`)

  const roundTrip = same(fromSpec(spec), doc)
  console.log(`왕복 무손실       ${roundTrip ? 'O' : 'X'}`)
  if (!roundTrip) failures++

  const base = shapeOf(spec.rows)
  const variants = makeVariants(doc, { ...defaultVariantSetOptions, count: 4, hue: 200 })
  let ok = 0
  for (const v of variants) {
    const vs = toSpec(v.doc)
    const match = shapeOf(vs.rows) === base
    if (match) ok++
    else failures++
    const colors = Object.keys(vs.palette).length
    console.log(
      `  ${String(Math.round(v.hue)).padStart(3)}도  배치 동일 ${match ? 'O' : 'X'}  ` +
        `색 ${colors}종 (원본 ${Object.keys(spec.palette).length}종)`,
    )
  }
  console.log(`배치 유지 ${ok}/${variants.length}`)

  // 눈이 실제로 어떤 배치인지 눈으로 확인할 수 있게 몇 줄 보여준다.
  const mid = Math.floor(spec.h / 2)
  console.log('원본 가운데 3줄:')
  for (const r of spec.rows.slice(mid - 1, mid + 2)) console.log('  ' + r)
  console.log('200도 변형 같은 줄:')
  for (const r of toSpec(variants[0].doc).rows.slice(mid - 1, mid + 2)) console.log('  ' + r)
}

console.log(failures === 0 ? '\n전부 통과' : `\n실패 ${failures}건`)
process.exit(failures === 0 ? 0 : 1)
