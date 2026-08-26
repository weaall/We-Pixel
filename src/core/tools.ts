import type { RGBA } from './color'
import { equals, TRANSPARENT } from './color'
import type { PixelDoc } from './doc'
import { getPixel, inBounds, setPixel } from './doc'

export type ToolId =
  | 'pen'
  | 'eraser'
  | 'line'
  | 'rect'
  | 'rectFill'
  | 'fill'
  | 'picker'
  | 'select'

export interface StampOptions {
  /** 정사각 브러시 한 변의 길이(픽셀). */
  size: number
  mirrorX: boolean
  mirrorY: boolean
}

export const defaultStampOptions: StampOptions = { size: 1, mirrorX: false, mirrorY: false }

/** 브러시 한 번 찍기. 미러 옵션이 켜져 있으면 대칭 위치에도 찍는다. */
export function stamp(doc: PixelDoc, x: number, y: number, c: RGBA, o: StampOptions): void {
  const half = Math.floor((o.size - 1) / 2)
  const xs = o.mirrorX ? [x, doc.w - 1 - x] : [x]
  const ys = o.mirrorY ? [y, doc.h - 1 - y] : [y]
  for (const bx of xs) {
    for (const by of ys) {
      for (let dy = 0; dy < o.size; dy++) {
        for (let dx = 0; dx < o.size; dx++) {
          setPixel(doc, bx - half + dx, by - half + dy, c)
        }
      }
    }
  }
}

/** Bresenham 직선. 드래그 중 프레임 사이가 벌어져도 선이 끊기지 않게 쓴다. */
export function drawLine(
  doc: PixelDoc,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: RGBA,
  o: StampOptions,
): void {
  let x = x0
  let y = y0
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  for (;;) {
    stamp(doc, x, y, c, o)
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
  }
}

export function drawRect(
  doc: PixelDoc,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: RGBA,
  o: StampOptions,
  filled: boolean,
): void {
  const lx = Math.min(x0, x1)
  const rx = Math.max(x0, x1)
  const ty = Math.min(y0, y1)
  const by = Math.max(y0, y1)
  if (filled) {
    for (let y = ty; y <= by; y++) {
      for (let x = lx; x <= rx; x++) stamp(doc, x, y, c, o)
    }
    return
  }
  for (let x = lx; x <= rx; x++) {
    stamp(doc, x, ty, c, o)
    stamp(doc, x, by, c, o)
  }
  for (let y = ty; y <= by; y++) {
    stamp(doc, lx, y, c, o)
    stamp(doc, rx, y, c, o)
  }
}

/**
 * 4방향 스캔라인 플러드 필. 재귀 대신 명시적 스택을 써서
 * 256x256 전체를 채워도 콜 스택이 넘치지 않는다.
 */
export function floodFill(doc: PixelDoc, sx: number, sy: number, c: RGBA): void {
  if (!inBounds(doc, sx, sy)) return
  const target = getPixel(doc, sx, sy)
  if (equals(target, c)) return

  const matches = (x: number, y: number) => equals(getPixel(doc, x, y), target)
  const stack: Array<[number, number]> = [[sx, sy]]

  while (stack.length > 0) {
    const [px, py] = stack.pop()!
    if (!matches(px, py)) continue

    let left = px
    while (left - 1 >= 0 && matches(left - 1, py)) left--
    let right = px
    while (right + 1 < doc.w && matches(right + 1, py)) right++

    for (let x = left; x <= right; x++) setPixel(doc, x, py, c)

    for (const ny of [py - 1, py + 1]) {
      if (ny < 0 || ny >= doc.h) continue
      let x = left
      while (x <= right) {
        if (matches(x, ny)) {
          stack.push([x, ny])
          while (x <= right && matches(x, ny)) x++
        }
        x++
      }
    }
  }
}

export function eraseColor(): RGBA {
  return TRANSPARENT
}

/**
 * 스탬프가 덮게 될 칸 목록. 커서 표시용이다.
 *
 * stamp()와 같은 계산이지만 배열을 만들므로 그리기 경로에서는 쓰지 않는다.
 * 스트로크 중에 매번 배열을 할당하면 GC가 입력 지연으로 돌아온다.
 */
export function stampCells(
  doc: PixelDoc,
  x: number,
  y: number,
  o: StampOptions,
): Array<{ x: number; y: number }> {
  const half = Math.floor((o.size - 1) / 2)
  const xs = o.mirrorX ? [x, doc.w - 1 - x] : [x]
  const ys = o.mirrorY ? [y, doc.h - 1 - y] : [y]
  const seen = new Set<number>()
  const cells: Array<{ x: number; y: number }> = []

  for (const bx of xs) {
    for (const by of ys) {
      for (let dy = 0; dy < o.size; dy++) {
        for (let dx = 0; dx < o.size; dx++) {
          const cx = bx - half + dx
          const cy = by - half + dy
          if (!inBounds(doc, cx, cy)) continue
          // 대칭이 겹치는 자리가 생긴다. 테두리를 두 번 그리면 진하게 보인다.
          const key = cy * doc.w + cx
          if (seen.has(key)) continue
          seen.add(key)
          cells.push({ x: cx, y: cy })
        }
      }
    }
  }
  return cells
}
