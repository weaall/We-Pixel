import type { PixelDoc } from './doc'
import { getPixel, setPixel } from './doc'

export type CompositeMode = 'front' | 'behind'

/** 붙일 위치. 캔버스 안에서 어디에 맞출지 정한다. */
export type Anchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right'

export const ANCHORS: ReadonlyArray<Anchor> = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
]

export interface CompositeResult {
  doc: PixelDoc
  /** 비어 있던 자리에 새로 그려진 픽셀 수. */
  added: number
  /** 원본을 덮은 픽셀 수. behind에서는 항상 0. */
  covered: number
  /** 원본의 불투명 픽셀 수. 덮은 비율을 판단하는 기준. */
  baseOpaque: number
}

/** 앵커를 좌상단 좌표로 바꾼다. */
export function anchorOffset(
  base: { w: number; h: number },
  addition: { w: number; h: number },
  anchor: Anchor,
): { x: number; y: number } {
  const dx = base.w - addition.w
  const dy = base.h - addition.h
  const x = anchor.includes('left') ? 0 : anchor.includes('right') ? dx : Math.round(dx / 2)
  const y = anchor.startsWith('top') ? 0 : anchor.startsWith('bottom') ? dy : Math.round(dy / 2)
  return { x, y }
}

/**
 * 원본 위에 다른 그림을 합친다.
 *
 * - front  : 붙이는 그림이 그려진 자리를 덮는다. 투명한 자리는 원본이 남는다.
 * - behind : 원본이 있는 자리는 건드리지 않는다. 빈 자리에만 들어간다.
 *
 * 캔버스 크기는 원본을 따른다. 넘치는 부분은 잘린다 — 붙이려고 캔버스가
 * 멋대로 커지면 유니티 스프라이트 크기가 어긋난다.
 */
export function composite(
  base: PixelDoc,
  addition: PixelDoc,
  options: { mode: CompositeMode; x: number; y: number },
): CompositeResult {
  const doc: PixelDoc = { w: base.w, h: base.h, data: new Uint8ClampedArray(base.data) }
  let added = 0
  let covered = 0
  let baseOpaque = 0

  for (let y = 0; y < base.h; y++) {
    for (let x = 0; x < base.w; x++) {
      if (getPixel(base, x, y)[3] !== 0) baseOpaque++
    }
  }

  for (let ay = 0; ay < addition.h; ay++) {
    const y = ay + options.y
    if (y < 0 || y >= base.h) continue
    for (let ax = 0; ax < addition.w; ax++) {
      const x = ax + options.x
      if (x < 0 || x >= base.w) continue

      const over = getPixel(addition, ax, ay)
      if (over[3] === 0) continue

      const under = getPixel(base, x, y)
      if (under[3] === 0) {
        setPixel(doc, x, y, over)
        added++
      } else if (options.mode === 'front') {
        setPixel(doc, x, y, over)
        covered++
      }
    }
  }

  return { doc, added, covered, baseOpaque }
}
