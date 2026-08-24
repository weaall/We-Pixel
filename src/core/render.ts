import type { PixelDoc } from './doc'

export interface RenderOptions {
  zoom: number
  showGrid: boolean
  /** 격자선을 그릴 최소 zoom. 너무 촘촘하면 그림이 안 보인다. */
  gridMinZoom?: number
}

const CHECKER_A = '#2a2a33'
const CHECKER_B = '#22222a'
const CHECKER_SIZE = 8

/**
 * 오프스크린 버퍼를 doc마다 재사용한다.
 * WebGL/Canvas 어느 쪽이든 프레임마다 캔버스를 새로 만드는 것이 가장 흔한 성능 실수다.
 */
export class DocRenderer {
  private buffer = document.createElement('canvas')
  private bufferCtx: CanvasRenderingContext2D

  constructor() {
    const ctx = this.buffer.getContext('2d', { willReadFrequently: false })
    if (!ctx) throw new Error('2D 컨텍스트를 만들 수 없습니다')
    this.bufferCtx = ctx
  }

  /** doc을 1:1 크기 오프스크린 캔버스에 올린 뒤 참조를 돌려준다. */
  rasterize(doc: PixelDoc): HTMLCanvasElement {
    if (this.buffer.width !== doc.w || this.buffer.height !== doc.h) {
      this.buffer.width = doc.w
      this.buffer.height = doc.h
    }
    this.bufferCtx.clearRect(0, 0, doc.w, doc.h)
    this.bufferCtx.putImageData(new ImageData(doc.data, doc.w, doc.h), 0, 0)
    return this.buffer
  }

  draw(display: HTMLCanvasElement, doc: PixelDoc, opts: RenderOptions): void {
    const ctx = display.getContext('2d')
    if (!ctx) return

    const w = doc.w * opts.zoom
    const h = doc.h * opts.zoom
    if (display.width !== w || display.height !== h) {
      display.width = w
      display.height = h
    }

    // 투명 영역용 체커보드
    ctx.clearRect(0, 0, w, h)
    for (let y = 0; y < h; y += CHECKER_SIZE) {
      for (let x = 0; x < w; x += CHECKER_SIZE) {
        const odd = ((x / CHECKER_SIZE) | 0) + ((y / CHECKER_SIZE) | 0)
        ctx.fillStyle = odd % 2 === 0 ? CHECKER_A : CHECKER_B
        ctx.fillRect(x, y, Math.min(CHECKER_SIZE, w - x), Math.min(CHECKER_SIZE, h - y))
      }
    }

    // 픽셀 아트의 생명줄: 확대 시 보간 금지
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(this.rasterize(doc), 0, 0, w, h)

    if (opts.showGrid && opts.zoom >= (opts.gridMinZoom ?? 6)) {
      ctx.strokeStyle = 'rgba(255,255,255,0.10)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = 1; x < doc.w; x++) {
        ctx.moveTo(x * opts.zoom + 0.5, 0)
        ctx.lineTo(x * opts.zoom + 0.5, h)
      }
      for (let y = 1; y < doc.h; y++) {
        ctx.moveTo(0, y * opts.zoom + 0.5)
        ctx.lineTo(w, y * opts.zoom + 0.5)
      }
      ctx.stroke()
    }
  }
}

/** 표시 캔버스 상의 마우스 좌표를 픽셀 인덱스로 변환한다. */
export function screenToPixel(
  display: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  doc: PixelDoc,
): { x: number; y: number } {
  const rect = display.getBoundingClientRect()
  // CSS 크기와 캔버스 해상도가 다를 수 있으므로 rect 기준으로 정규화한다.
  const nx = (clientX - rect.left) / rect.width
  const ny = (clientY - rect.top) / rect.height
  return {
    x: Math.floor(nx * doc.w),
    y: Math.floor(ny * doc.h),
  }
}
