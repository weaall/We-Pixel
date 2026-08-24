/**
 * 생성기 출력을 터미널에서 ASCII로 확인한다.
 * 브라우저를 띄우지 않고 알고리즘 품질만 빠르게 볼 때 쓴다.
 *
 *   npm run preview:sprite -- 32 6
 */
import { generateSprite, defaultSpriteOptions } from '../src/core/generate/sprite'
import { getPixel } from '../src/core/doc'
import type { PixelDoc } from '../src/core/doc'

const size = Number(process.argv[2] ?? 32)
const count = Number(process.argv[3] ?? 4)

// 밝기 순으로 정렬된 램프. 어두운 외곽선과 밝은 하이라이트가 구분되어야 한다.
const RAMP = ' .:-=+*#%@'

function toAscii(doc: PixelDoc): string[] {
  const lines: string[] = []
  for (let y = 0; y < doc.h; y++) {
    let line = ''
    for (let x = 0; x < doc.w; x++) {
      const [r, g, b, a] = getPixel(doc, x, y)
      if (a === 0) {
        line += ' '
        continue
      }
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
      const idx = Math.min(RAMP.length - 1, Math.max(1, Math.round(lum * (RAMP.length - 1))))
      line += RAMP[idx]
    }
    lines.push(line)
  }
  return lines
}

const docs = Array.from({ length: count }, (_, i) => {
  const seed = 1000 + i * 7919
  return {
    seed,
    doc: generateSprite({ ...defaultSpriteOptions, w: size, h: size, seed, hue: (i * 67) % 360 }),
  }
})

const grids = docs.map((d) => toAscii(d.doc))
const gap = '   '

console.log(docs.map((d) => `seed ${d.seed}`.padEnd(size + gap.length)).join(''))
for (let y = 0; y < size; y++) {
  console.log(grids.map((g) => g[y].padEnd(size)).join(gap))
}

for (const { seed, doc } of docs) {
  let filled = 0
  for (let i = 3; i < doc.data.length; i += 4) if (doc.data[i] !== 0) filled++
  console.log(`seed ${seed}: ${filled}/${size * size} 픽셀 (${((filled / (size * size)) * 100).toFixed(1)}%)`)
}
