import type { PixelDoc } from './doc'
import { createDoc } from './doc'
import { MAX_SPEC_COLORS } from './codec'

export interface QuantizeOptions {
  /** 목표 색상 수. 픽셀 아트는 보통 8~24 사이가 알맞다. */
  colors: number
  /** Floyd-Steinberg 오차 확산. 작은 캔버스에서는 지저분해지므로 기본은 끈다. */
  dither: boolean
  /** 이 값 미만의 알파는 완전 투명, 이상은 완전 불투명으로 만든다. */
  alphaThreshold: number
}

export const defaultQuantizeOptions: QuantizeOptions = {
  colors: 16,
  dither: false,
  alphaThreshold: 128,
}

/** spec 포맷의 한계를 넘지 않도록 상한을 둔다. 투명 문자 몫으로 하나 뺀다. */
export const MAX_QUANTIZE_COLORS = Math.min(48, MAX_SPEC_COLORS - 1)

type RGB = [number, number, number]

/**
 * 미디언 컷 색상 양자화.
 *
 * 사진을 그대로 넣으면 색이 수만 종이 되어 픽셀 아트로 보이지도 않고
 * spec 포맷(팔레트 문자 75개)에도 담기지 않는다. 색을 줄이는 것이
 * 이미지 가져오기의 핵심이다.
 *
 * 알파는 이진화한다. 픽셀 아트 스프라이트는 반투명 경계를 쓰지 않는 것이 보통이고,
 * 반투명이 남으면 유니티에서 Point 필터와 겹쳐 지저분한 테두리가 생긴다.
 */
export function quantize(doc: PixelDoc, options: QuantizeOptions): PixelDoc {
  const target = Math.max(2, Math.min(MAX_QUANTIZE_COLORS, Math.floor(options.colors)))
  const out = createDoc(doc.w, doc.h)

  // 1. 불투명 픽셀만 모은다. 투명 픽셀의 색은 팔레트를 오염시킨다.
  const opaque: number[] = []
  for (let i = 0; i < doc.data.length; i += 4) {
    if (doc.data[i + 3] >= options.alphaThreshold) opaque.push(i)
  }
  if (opaque.length === 0) return out

  const samples: RGB[] = opaque.map((i) => [doc.data[i], doc.data[i + 1], doc.data[i + 2]])
  const palette = medianCut(samples, target)

  // 2. 매핑
  if (options.dither) {
    ditherMap(doc, out, palette, options.alphaThreshold)
  } else {
    for (let i = 0; i < doc.data.length; i += 4) {
      if (doc.data[i + 3] < options.alphaThreshold) continue
      const c = palette[nearestIndex(palette, doc.data[i], doc.data[i + 1], doc.data[i + 2])]
      out.data[i] = c[0]
      out.data[i + 1] = c[1]
      out.data[i + 2] = c[2]
      out.data[i + 3] = 255
    }
  }
  return out
}

/**
 * 색 공간을 상자로 나눈다. 매번 가장 넓은 상자를 가장 긴 축의 중앙값에서 자른다.
 * 균등 분할과 달리 실제로 색이 몰려 있는 영역에 팔레트를 더 많이 배분한다.
 */
function medianCut(samples: RGB[], target: number): RGB[] {
  const pixels = samples.slice()
  let boxes: Array<{ start: number; end: number }> = [{ start: 0, end: pixels.length }]

  while (boxes.length < target) {
    let bestIndex = -1
    let bestRange = 0
    let bestAxis = 0

    boxes.forEach((box, i) => {
      if (box.end - box.start < 2) return
      const [range, axis] = widestAxis(pixels, box.start, box.end)
      if (range > bestRange) {
        bestRange = range
        bestIndex = i
        bestAxis = axis
      }
    })

    // 더 이상 쪼갤 수 없다 — 원본 색상 수가 목표보다 적은 경우.
    if (bestIndex < 0 || bestRange === 0) break

    const box = boxes[bestIndex]
    const slice = pixels.slice(box.start, box.end)
    slice.sort((a, b) => a[bestAxis] - b[bestAxis])
    for (let i = 0; i < slice.length; i++) pixels[box.start + i] = slice[i]

    const mid = box.start + (slice.length >> 1)
    boxes = [
      ...boxes.slice(0, bestIndex),
      { start: box.start, end: mid },
      { start: mid, end: box.end },
      ...boxes.slice(bestIndex + 1),
    ]
  }

  return boxes
    .filter((b) => b.end > b.start)
    .map((b) => {
      let r = 0
      let g = 0
      let bl = 0
      for (let i = b.start; i < b.end; i++) {
        r += pixels[i][0]
        g += pixels[i][1]
        bl += pixels[i][2]
      }
      const n = b.end - b.start
      return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)] as RGB
    })
}

function widestAxis(pixels: RGB[], start: number, end: number): [number, number] {
  const min: RGB = [255, 255, 255]
  const max: RGB = [0, 0, 0]
  for (let i = start; i < end; i++) {
    for (let a = 0; a < 3; a++) {
      if (pixels[i][a] < min[a]) min[a] = pixels[i][a]
      if (pixels[i][a] > max[a]) max[a] = pixels[i][a]
    }
  }
  // 사람 눈은 녹색에 민감하다. 가중치를 주면 초록 계열이 뭉개지는 것을 줄인다.
  const weights = [0.9, 1.2, 0.7]
  let bestRange = 0
  let bestAxis = 0
  for (let a = 0; a < 3; a++) {
    const range = (max[a] - min[a]) * weights[a]
    if (range > bestRange) {
      bestRange = range
      bestAxis = a
    }
  }
  return [bestRange, bestAxis]
}

function nearestIndex(palette: RGB[], r: number, g: number, b: number): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < palette.length; i++) {
    const dr = palette[i][0] - r
    const dg = palette[i][1] - g
    const db = palette[i][2] - b
    // 제곱 거리로 비교한다. 제곱근은 순서를 바꾸지 않으므로 계산할 이유가 없다.
    const d = dr * dr * 0.9 + dg * dg * 1.2 + db * db * 0.7
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}

/** Floyd-Steinberg. 오차를 오른쪽/아래로 흘려 계조를 흉내낸다. */
function ditherMap(
  doc: PixelDoc,
  out: PixelDoc,
  palette: RGB[],
  alphaThreshold: number,
): void {
  // 오차가 음수로도 가므로 클램프되지 않는 Float32Array에 복사해서 작업한다.
  const buf = new Float32Array(doc.w * doc.h * 3)
  for (let p = 0; p < doc.w * doc.h; p++) {
    buf[p * 3] = doc.data[p * 4]
    buf[p * 3 + 1] = doc.data[p * 4 + 1]
    buf[p * 3 + 2] = doc.data[p * 4 + 2]
  }

  const spread = (p: number, er: number, eg: number, eb: number, factor: number) => {
    buf[p * 3] += er * factor
    buf[p * 3 + 1] += eg * factor
    buf[p * 3 + 2] += eb * factor
  }

  for (let y = 0; y < doc.h; y++) {
    for (let x = 0; x < doc.w; x++) {
      const p = y * doc.w + x
      if (doc.data[p * 4 + 3] < alphaThreshold) continue

      const r = buf[p * 3]
      const g = buf[p * 3 + 1]
      const b = buf[p * 3 + 2]
      const c = palette[nearestIndex(palette, r, g, b)]

      out.data[p * 4] = c[0]
      out.data[p * 4 + 1] = c[1]
      out.data[p * 4 + 2] = c[2]
      out.data[p * 4 + 3] = 255

      const er = r - c[0]
      const eg = g - c[1]
      const eb = b - c[2]

      if (x + 1 < doc.w) spread(p + 1, er, eg, eb, 7 / 16)
      if (y + 1 < doc.h) {
        if (x > 0) spread(p + doc.w - 1, er, eg, eb, 3 / 16)
        spread(p + doc.w, er, eg, eb, 5 / 16)
        if (x + 1 < doc.w) spread(p + doc.w + 1, er, eg, eb, 1 / 16)
      }
    }
  }
}
