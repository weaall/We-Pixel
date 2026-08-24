import type { RGBA } from './color'
import { TRANSPARENT } from './color'

/**
 * ImageData는 SharedArrayBuffer 기반 뷰를 받지 않는다.
 * TS 5.7부터 TypedArray가 버퍼 종류로 제네릭화되었으므로 여기서 고정해 둔다.
 */
export type PixelBuffer = Uint8ClampedArray<ArrayBuffer>

/**
 * 픽셀 문서. 내부 표현은 RGBA 바이트 배열이다.
 * Uint32Array를 쓰면 엔디언에 의존하게 되므로 의도적으로 바이트 단위로 둔다.
 */
export interface PixelDoc {
  w: number
  h: number
  /** 길이 = w * h * 4, 순서 R,G,B,A. */
  data: PixelBuffer
}

export const MIN_SIZE = 4
export const MAX_SIZE = 256

export function createDoc(w: number, h: number, fill: RGBA = TRANSPARENT): PixelDoc {
  const doc: PixelDoc = { w, h, data: new Uint8ClampedArray(w * h * 4) }
  if (fill[3] !== 0) fillAll(doc, fill)
  return doc
}

export function cloneDoc(doc: PixelDoc): PixelDoc {
  return { w: doc.w, h: doc.h, data: new Uint8ClampedArray(doc.data) }
}

export function inBounds(doc: PixelDoc, x: number, y: number): boolean {
  return x >= 0 && x < doc.w && y >= 0 && y < doc.h
}

export function getPixel(doc: PixelDoc, x: number, y: number): RGBA {
  if (!inBounds(doc, x, y)) return TRANSPARENT
  const i = (y * doc.w + x) * 4
  return [doc.data[i], doc.data[i + 1], doc.data[i + 2], doc.data[i + 3]]
}

export function setPixel(doc: PixelDoc, x: number, y: number, c: RGBA): void {
  if (!inBounds(doc, x, y)) return
  const i = (y * doc.w + x) * 4
  doc.data[i] = c[0]
  doc.data[i + 1] = c[1]
  doc.data[i + 2] = c[2]
  doc.data[i + 3] = c[3]
}

export function fillAll(doc: PixelDoc, c: RGBA): void {
  for (let i = 0; i < doc.data.length; i += 4) {
    doc.data[i] = c[0]
    doc.data[i + 1] = c[1]
    doc.data[i + 2] = c[2]
    doc.data[i + 3] = c[3]
  }
}

export function clear(doc: PixelDoc): void {
  doc.data.fill(0)
}

/** 좌상단 기준으로 잘라내거나 여백을 채워 새 크기의 문서를 만든다. */
export function resizeDoc(doc: PixelDoc, w: number, h: number): PixelDoc {
  const next = createDoc(w, h)
  const cw = Math.min(w, doc.w)
  const ch = Math.min(h, doc.h)
  for (let y = 0; y < ch; y++) {
    const src = y * doc.w * 4
    const dst = y * w * 4
    next.data.set(doc.data.subarray(src, src + cw * 4), dst)
  }
  return next
}

/** 그려진 픽셀(알파 > 0)의 경계. 완전히 비었으면 null. */
export function contentBounds(
  doc: PixelDoc,
): { x: number; y: number; w: number; h: number } | null {
  let minX = doc.w
  let minY = doc.h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < doc.h; y++) {
    for (let x = 0; x < doc.w; x++) {
      if (doc.data[(y * doc.w + x) * 4 + 3] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}
