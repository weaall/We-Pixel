import type { PixelDoc } from './doc'
import { createDoc } from './doc'

export type ResampleMode = 'area' | 'nearest'

/**
 * 크기 변환.
 *
 * - area    : 원본 영역을 평균낸다. 사진이나 일러스트를 픽셀 아트 크기로 줄일 때.
 * - nearest : 가장 가까운 픽셀을 집는다. 이미 픽셀 아트인 이미지가 확대되어
 *             저장된 경우(예: 16x16을 8배로 키운 128x128) 평균을 내면 경계가
 *             뭉개지므로 이쪽을 써야 원본 도트가 살아난다.
 *
 * 알파는 프리멀티플라이해서 섞는다. 그냥 평균내면 투명한 픽셀의 RGB(보통 0,0,0)가
 * 딸려 들어와 경계에 검은 테두리가 생긴다.
 */
export function resample(doc: PixelDoc, w: number, h: number, mode: ResampleMode): PixelDoc {
  if (w === doc.w && h === doc.h) return { w, h, data: new Uint8ClampedArray(doc.data) }
  return mode === 'nearest' ? nearest(doc, w, h) : area(doc, w, h)
}

function nearest(doc: PixelDoc, w: number, h: number): PixelDoc {
  const out = createDoc(w, h)
  for (let y = 0; y < h; y++) {
    // 셀 중앙을 집는다. 좌상단을 집으면 결과가 반 픽셀 밀린다.
    const sy = Math.min(doc.h - 1, Math.floor(((y + 0.5) * doc.h) / h))
    for (let x = 0; x < w; x++) {
      const sx = Math.min(doc.w - 1, Math.floor(((x + 0.5) * doc.w) / w))
      const si = (sy * doc.w + sx) * 4
      const di = (y * w + x) * 4
      out.data[di] = doc.data[si]
      out.data[di + 1] = doc.data[si + 1]
      out.data[di + 2] = doc.data[si + 2]
      out.data[di + 3] = doc.data[si + 3]
    }
  }
  return out
}

function area(doc: PixelDoc, w: number, h: number): PixelDoc {
  const out = createDoc(w, h)
  const xRatio = doc.w / w
  const yRatio = doc.h / h

  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * yRatio)
    const y1 = Math.max(y0 + 1, Math.ceil((y + 1) * yRatio))
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * xRatio)
      const x1 = Math.max(x0 + 1, Math.ceil((x + 1) * xRatio))

      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let n = 0

      for (let sy = y0; sy < Math.min(y1, doc.h); sy++) {
        for (let sx = x0; sx < Math.min(x1, doc.w); sx++) {
          const si = (sy * doc.w + sx) * 4
          const alpha = doc.data[si + 3] / 255
          // 프리멀티플라이: 투명한 픽셀의 색이 결과에 섞이지 않게 한다.
          r += doc.data[si] * alpha
          g += doc.data[si + 1] * alpha
          b += doc.data[si + 2] * alpha
          a += alpha
          n++
        }
      }

      const di = (y * w + x) * 4
      if (n === 0 || a === 0) {
        out.data[di + 3] = 0
        continue
      }
      // 알파 합으로 나눠 원래 색으로 되돌린다(언프리멀티플라이).
      out.data[di] = r / a
      out.data[di + 1] = g / a
      out.data[di + 2] = b / a
      out.data[di + 3] = (a / n) * 255
    }
  }
  return out
}

/**
 * 원본이 정수배로 확대된 픽셀 아트인지 추정한다.
 *
 * 같은 색이 연속되는 구간의 길이를 세어, 가로/세로 모두에서 공통 배수가 나오면
 * 그 배수를 돌려준다. 확대된 픽셀 아트를 area로 줄이면 도트가 뭉개지므로
 * 이 경우에는 nearest를 권해야 한다.
 */
export function detectPixelScale(doc: PixelDoc): number {
  const runs: number[] = []

  for (let y = 0; y < doc.h; y += Math.max(1, Math.floor(doc.h / 16))) {
    let run = 1
    for (let x = 1; x < doc.w; x++) {
      if (samePixel(doc, x, y, x - 1, y)) run++
      else {
        runs.push(run)
        run = 1
      }
    }
    runs.push(run)
  }

  if (runs.length < 4) return 1
  const g = runs.reduce((acc, v) => gcd(acc, v))
  // 지나치게 큰 값은 단색 이미지 같은 경우라 신뢰하지 않는다.
  return g >= 2 && g <= 32 ? g : 1
}

function samePixel(doc: PixelDoc, x1: number, y1: number, x2: number, y2: number): boolean {
  const a = (y1 * doc.w + x1) * 4
  const b = (y2 * doc.w + x2) * 4
  return (
    doc.data[a] === doc.data[b] &&
    doc.data[a + 1] === doc.data[b + 1] &&
    doc.data[a + 2] === doc.data[b + 2] &&
    doc.data[a + 3] === doc.data[b + 3]
  )
}

function gcd(a: number, b: number): number {
  while (b > 0) {
    const t = a % b
    a = b
    b = t
  }
  return a
}
