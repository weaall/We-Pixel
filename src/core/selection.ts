import type { PixelDoc } from './doc'
import { createDoc, getPixel, inBounds, setPixel } from './doc'
import type { CompositeMode } from './compose'
import { composite } from './compose'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** 드래그한 두 점을 사각형으로. 어느 방향으로 끌어도 같은 결과가 나와야 한다. */
export function rectFromPoints(x0: number, y0: number, x1: number, y1: number): Rect {
  const x = Math.min(x0, x1)
  const y = Math.min(y0, y1)
  return { x, y, w: Math.abs(x1 - x0) + 1, h: Math.abs(y1 - y0) + 1 }
}

/** 캔버스 안으로 자른다. 완전히 벗어났으면 null. */
export function clampRect(rect: Rect, doc: PixelDoc): Rect | null {
  const x = Math.max(0, rect.x)
  const y = Math.max(0, rect.y)
  const right = Math.min(doc.w, rect.x + rect.w)
  const bottom = Math.min(doc.h, rect.y + rect.h)
  if (right <= x || bottom <= y) return null
  return { x, y, w: right - x, h: bottom - y }
}

export function containsPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h
}

/** 선택 영역을 새 문서로 떠낸다. */
export function copyRegion(doc: PixelDoc, rect: Rect): PixelDoc {
  const safe = clampRect(rect, doc)
  if (safe === null) return createDoc(1, 1)
  const out = createDoc(safe.w, safe.h)
  for (let y = 0; y < safe.h; y++) {
    for (let x = 0; x < safe.w; x++) {
      setPixel(out, x, y, getPixel(doc, safe.x + x, safe.y + y))
    }
  }
  return out
}

/** 선택 영역을 비운다. 문서를 직접 고친다 — 호출자가 히스토리를 남긴 뒤에 쓴다. */
export function clearRegion(doc: PixelDoc, rect: Rect): number {
  const safe = clampRect(rect, doc)
  if (safe === null) return 0
  let cleared = 0
  for (let y = safe.y; y < safe.y + safe.h; y++) {
    for (let x = safe.x; x < safe.x + safe.w; x++) {
      if (getPixel(doc, x, y)[3] !== 0) cleared++
      setPixel(doc, x, y, [0, 0, 0, 0])
    }
  }
  return cleared
}

/**
 * 선택 영역을 옮긴다.
 *
 * 원래 자리를 비우고 새 자리에 붙인다. 잘라내기 후 붙여넣기와 같지만
 * 한 번의 되돌리기로 복구되어야 하므로 한 함수로 둔다.
 */
export function moveRegion(
  doc: PixelDoc,
  rect: Rect,
  dx: number,
  dy: number,
  mode: CompositeMode = 'front',
): { doc: PixelDoc; rect: Rect } {
  const region = copyRegion(doc, rect)
  const emptied: PixelDoc = { w: doc.w, h: doc.h, data: new Uint8ClampedArray(doc.data) }
  clearRegion(emptied, rect)

  const safe = clampRect(rect, doc) ?? rect
  const next = composite(emptied, region, { mode, x: safe.x + dx, y: safe.y + dy })
  return { doc: next.doc, rect: { ...safe, x: safe.x + dx, y: safe.y + dy } }
}

/** 붙여넣기. 캔버스 크기는 유지하고 넘치는 부분은 잘린다. */
export function pasteAt(
  doc: PixelDoc,
  clip: PixelDoc,
  x: number,
  y: number,
  mode: CompositeMode = 'front',
): { doc: PixelDoc; rect: Rect } {
  const out = composite(doc, clip, { mode, x, y })
  return { doc: out.doc, rect: { x, y, w: clip.w, h: clip.h } }
}

/** 그려진 픽셀만 감싸는 최소 사각형. "내용에 맞춰 선택"용. */
export function contentRect(doc: PixelDoc): Rect | null {
  let minX = doc.w
  let minY = doc.h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < doc.h; y++) {
    for (let x = 0; x < doc.w; x++) {
      if (!inBounds(doc, x, y) || getPixel(doc, x, y)[3] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}
