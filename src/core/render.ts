import type { PixelDoc } from './doc'

export interface RenderOptions {
  zoom: number
  showGrid: boolean
  /** 격자선을 그릴 최소 zoom. 너무 촘촘하면 그림이 안 보인다. */
  gridMinZoom?: number
  /** 커서가 덮는 칸들. 도구와 브러시 크기, 대칭에 따라 여러 칸이 된다. */
  hover?: ReadonlyArray<{ x: number; y: number }> | null
  /** 선택 영역. 점선으로 표시한다. */
  selection?: { x: number; y: number; w: number; h: number } | null
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
  /**
   * 체커보드는 타일 패턴으로 한 번만 만든다.
   *
   * 칸마다 fillRect를 돌면 2048px 캔버스에서 6만 번이 넘는다. 커서를 움직일
   * 때마다 다시 그려야 하므로 그 비용이 그대로 입력 지연이 된다.
   */
  private checker: CanvasPattern | null = null

  constructor() {
    const ctx = this.buffer.getContext('2d', { willReadFrequently: false })
    if (!ctx) throw new Error('2D 컨텍스트를 만들 수 없습니다')
    this.bufferCtx = ctx
  }

  private checkerPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
    if (this.checker !== null) return this.checker
    const tile = document.createElement('canvas')
    tile.width = CHECKER_SIZE * 2
    tile.height = CHECKER_SIZE * 2
    const tctx = tile.getContext('2d')
    if (!tctx) return null
    tctx.fillStyle = CHECKER_A
    tctx.fillRect(0, 0, tile.width, tile.height)
    tctx.fillStyle = CHECKER_B
    tctx.fillRect(CHECKER_SIZE, 0, CHECKER_SIZE, CHECKER_SIZE)
    tctx.fillRect(0, CHECKER_SIZE, CHECKER_SIZE, CHECKER_SIZE)
    this.checker = ctx.createPattern(tile, 'repeat')
    return this.checker
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
    const pattern = this.checkerPattern(ctx)
    if (pattern !== null) {
      ctx.fillStyle = pattern
      ctx.fillRect(0, 0, w, h)
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

    if (opts.hover && opts.hover.length > 0) {
      drawHover(ctx, opts.hover, opts.zoom)
    }

    if (opts.selection) {
      drawSelection(ctx, opts.selection, opts.zoom)
    }
  }
}

/**
 * 커서가 덮는 칸을 테두리로 표시한다.
 *
 * 어두운 선과 밝은 선을 겹쳐 그린다. 한 가지 색만 쓰면 비슷한 밝기의 그림 위에서
 * 테두리가 사라진다.
 */
function drawHover(
  ctx: CanvasRenderingContext2D,
  cells: ReadonlyArray<{ x: number; y: number }>,
  zoom: number,
): void {
  ctx.save()
  ctx.lineWidth = 1

  for (const pass of [
    { color: 'rgba(0, 0, 0, 0.75)', inset: 0.5 },
    { color: 'rgba(255, 255, 255, 0.95)', inset: 1.5 },
  ]) {
    ctx.strokeStyle = pass.color
    ctx.beginPath()
    for (const cell of cells) {
      const x = cell.x * zoom
      const y = cell.y * zoom
      // 0.5 오프셋이 없으면 1px 선이 두 픽셀에 걸쳐 흐려진다.
      ctx.rect(x + pass.inset, y + pass.inset, zoom - pass.inset * 2, zoom - pass.inset * 2)
    }
    ctx.stroke()
    // 확대율이 낮으면 두 겹을 그릴 자리가 없다.
    if (zoom < 4) break
  }

  ctx.restore()
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

/**
 * 선택 영역 테두리.
 *
 * 흰 점선과 검은 점선을 어긋나게 겹친다. 한 색만 쓰면 비슷한 밝기의 그림 위에서
 * 테두리가 사라진다 — 커서 표시와 같은 이유다.
 */
function drawSelection(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  zoom: number,
): void {
  const x = rect.x * zoom + 0.5
  const y = rect.y * zoom + 0.5
  const w = rect.w * zoom - 1
  const h = rect.h * zoom - 1

  ctx.save()
  ctx.lineWidth = 1

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
  ctx.setLineDash([4, 4])
  ctx.lineDashOffset = 0
  ctx.strokeRect(x, y, w, h)

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
  ctx.lineDashOffset = 4
  ctx.strokeRect(x, y, w, h)

  ctx.restore()
}
