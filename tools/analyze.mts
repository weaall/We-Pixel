/**
 * 픽셀 아트 PNG 를 뜯어 본다.
 *
 *   npx tsx tools/analyze.mts <파일...>
 *
 * 파일 크기와 실제 격자는 다를 수 있다. 64x64 로 저장된 그림이 실은 32x32 를
 * 2배로 늘린 것인 경우가 흔하고, 그대로 편집하면 픽셀이 어긋난다.
 */
import { readFileSync } from 'node:fs'
import { packRows, toSpec } from '../src/core/codec'
import { dominantHue, paletteOf } from '../src/core/generate/variants'
import { analyzePixelScale, toLogicalGrid } from '../src/core/resample'
import { decodePng } from '../src/import/pngDecode'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('사용법: npx tsx tools/analyze.mts <파일...>')
  process.exit(1)
}

for (const file of files) {
  const raw = decodePng(readFileSync(file))
  const { doc, scale } = toLogicalGrid(raw)
  const a = analyzePixelScale(raw)
  const spec = toSpec(doc)
  const plain = spec.rows.join('').length
  const packed = packRows(spec).join('').length
  const palette = paletteOf(doc)

  console.log(`\n### ${file.split(/[\/]/).pop()}`)
  console.log(`파일 ${raw.w}x${raw.h} -> 실제 격자 ${doc.w}x${doc.h} (${a.scale}배)`)
  console.log(`격자 정렬 ${(a.alignment * 100).toFixed(1)}% · 어긋난 경계 ${a.strayEdges}/${a.totalEdges}`)
  console.log(`색 ${palette.length}종 · 대표 색조 ${dominantHue(palette)?.toFixed(0) ?? '-'}도`)
  console.log(`행 ${plain}자 -> 접으면 ${packed}자 (${Math.round((1 - packed / plain) * 100)}% 감소)`)
  console.log(JSON.stringify(spec.palette))
  console.log(spec.rows.join('\n'))
}
