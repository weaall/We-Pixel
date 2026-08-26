import type { RGBA } from './color'
import type { PixelDoc } from './doc'
import { createDoc, setPixel } from './doc'

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

export interface ScaleAnalysis {
  /** 추정한 블록 크기. 1이면 확대되지 않은 원본. */
  scale: number
  /** 색 경계가 그 격자에 맞는 비율. 1에 가까울수록 확신할 수 있다. */
  alignment: number
  /**
   * 격자를 벗어난 경계의 개수.
   *
   * 0보다 크면 부분마다 해상도가 다르다는 뜻이다. 주사위 몸통은 32픽셀처럼
   * 굵게, 눈은 64픽셀처럼 잘게 그린 이미지가 이런 경우다.
   */
  strayEdges: number
  /** 전체 색 경계 수. 너무 적으면 추정을 믿을 수 없다. */
  totalEdges: number
}

const MAX_DETECT_SCALE = 32
/** 이 비율 이상 맞아야 그 격자로 인정한다. */
const ALIGN_THRESHOLD = 0.9

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

/** 색이 바뀌는 좌표들. 가로/세로를 따로 모은다. */
function collectEdges(doc: PixelDoc): { xs: number[]; ys: number[] } {
  const xs: number[] = []
  const ys: number[] = []
  for (let y = 0; y < doc.h; y++) {
    for (let x = 1; x < doc.w; x++) {
      if (!samePixel(doc, x, y, x - 1, y)) xs.push(x)
    }
  }
  for (let x = 0; x < doc.w; x++) {
    for (let y = 1; y < doc.h; y++) {
      if (!samePixel(doc, x, y, x, y - 1)) ys.push(y)
    }
  }
  return { xs, ys }
}

/**
 * 확대된 픽셀 아트인지 추정한다.
 *
 * 예전에는 연속 구간 길이의 최대공약수를 썼는데, 1픽셀짜리 디테일이 하나만
 * 있어도 결과가 1이 되어 버렸다. 몸통은 굵게 눈은 잘게 그린 그림에서는
 * 항상 실패한다.
 *
 * 대신 색 경계가 격자에 맞는지를 본다. 잘게 그린 부분이 섞여 있어도 대부분의
 * 경계가 같은 간격에 놓이면 그 간격이 진짜 블록 크기다.
 */
export function analyzePixelScale(doc: PixelDoc): ScaleAnalysis {
  const { xs, ys } = collectEdges(doc)
  const totalEdges = xs.length + ys.length
  const flat: ScaleAnalysis = { scale: 1, alignment: 1, strayEdges: 0, totalEdges }
  // 경계가 거의 없으면 단색에 가깝다. 아무 배수나 다 맞아 버리므로 추정하지 않는다.
  if (totalEdges < 8) return flat

  // 큰 배수부터 본다. 4배로 맞으면 2배로도 맞으므로 큰 쪽이 정답이다.
  for (let scale = MAX_DETECT_SCALE; scale >= 2; scale--) {
    if (doc.w % scale !== 0 || doc.h % scale !== 0) continue
    let aligned = 0
    for (const x of xs) if (x % scale === 0) aligned++
    for (const y of ys) if (y % scale === 0) aligned++

    const alignment = aligned / totalEdges
    if (alignment >= ALIGN_THRESHOLD) {
      return { scale, alignment, strayEdges: totalEdges - aligned, totalEdges }
    }
  }
  return flat
}

/** 이전 이름. 배수만 필요한 곳에서 쓴다. */
export function detectPixelScale(doc: PixelDoc): number {
  return analyzePixelScale(doc).scale
}

/**
 * 격자에 맞춰 정리한다.
 *
 * 블록마다 가장 많이 쓰인 색으로 통일한다. 부분마다 해상도가 다른 그림을
 * 하나의 해상도로 맞출 때 쓴다 — 잘게 그린 디테일은 블록 색에 흡수된다.
 */
export function snapToGrid(doc: PixelDoc, scale: number): PixelDoc {
  if (scale <= 1) return { w: doc.w, h: doc.h, data: new Uint8ClampedArray(doc.data) }

  const out = createDoc(doc.w, doc.h)
  for (let by = 0; by < doc.h; by += scale) {
    for (let bx = 0; bx < doc.w; bx += scale) {
      const counts = new Map<string, { n: number; color: RGBA }>()
      for (let y = by; y < Math.min(by + scale, doc.h); y++) {
        for (let x = bx; x < Math.min(bx + scale, doc.w); x++) {
          const i = (y * doc.w + x) * 4
          const color: RGBA = [doc.data[i], doc.data[i + 1], doc.data[i + 2], doc.data[i + 3]]
          const key = color.join()
          const hit = counts.get(key)
          if (hit) hit.n++
          else counts.set(key, { n: 1, color })
        }
      }
      let best: RGBA = [0, 0, 0, 0]
      let bestN = -1
      for (const { n, color } of counts.values()) {
        if (n > bestN) {
          bestN = n
          best = color
        }
      }
      for (let y = by; y < Math.min(by + scale, doc.h); y++) {
        for (let x = bx; x < Math.min(bx + scale, doc.w); x++) setPixel(out, x, y, best)
      }
    }
  }
  return out
}
