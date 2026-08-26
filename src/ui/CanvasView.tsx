import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { RGBA } from '../core/color'
import { TRANSPARENT } from '../core/color'
import type { PixelDoc } from '../core/doc'
import { getPixel } from '../core/doc'
import { DocRenderer, screenToPixel } from '../core/render'
import type { StampOptions, ToolId } from '../core/tools'
import { drawLine, drawRect, floodFill, stamp, stampCells } from '../core/tools'
import type { Rect } from '../core/selection'
import { clampRect, containsPoint, moveRegion, rectFromPoints } from '../core/selection'

export interface CanvasViewProps {
  doc: PixelDoc
  zoom: number
  showGrid: boolean
  tool: ToolId
  color: RGBA
  stampOptions: StampOptions
  /** 문서를 바꾸기 직전에 호출. undo 스냅샷을 남긴다. */
  onBeforeStroke: () => void
  /** 스트로크가 끝나 React 상태를 갱신해야 할 때. */
  onDocChanged: () => void
  onPickColor: (c: RGBA) => void
  onHover: (pos: { x: number; y: number } | null) => void
  /** 매 페인트 직후 호출. 실제 크기 미리보기를 같은 경로로 갱신한다. */
  onPaint?: () => void
  selection: Rect | null
  onSelectionChange: (rect: Rect | null) => void
}

const SHAPE_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(['line', 'rect', 'rectFill'])

export function CanvasView(props: CanvasViewProps) {
  const {
    doc,
    zoom,
    showGrid,
    tool,
    color,
    stampOptions,
    onBeforeStroke,
    onDocChanged,
    onPickColor,
    onHover,
    onPaint,
    selection,
    onSelectionChange,
  } = props

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<DocRenderer | null>(null)

  const drawing = useRef(false)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const last = useRef<{ x: number; y: number } | null>(null)
  /** 도형 도구의 실시간 미리보기용 원본 스냅샷. */
  const base = useRef<Uint8ClampedArray | null>(null)
  /**
   * 커서가 놓인 칸. state로 두면 pointermove마다 리렌더가 돌아 무거워진다.
   * 그리기와 같은 경로(직접 페인트)로 처리한다.
   */
  const hover = useRef<{ x: number; y: number } | null>(null)
  /** 선택 드래그의 시작점. */
  const selectAnchor = useRef<{ x: number; y: number } | null>(null)
  /** 선택 영역을 끌어 옮기는 중일 때의 시작 정보. */
  const dragging = useRef<{ start: { x: number; y: number }; rect: Rect; base: PixelDoc } | null>(
    null,
  )

  /**
   * 스트로크 중에는 React를 거치지 않고 직접 그린다.
   * 매 pointermove마다 setState를 하면 렌더 왕복이 입력 지연으로 체감된다.
   */
  const paint = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!rendererRef.current) rendererRef.current = new DocRenderer()
    // 그리는 중에는 커서 표시를 숨긴다. 칠해지는 자리를 테두리가 가린다.
    const cursor =
      hover.current === null || drawing.current
        ? null
        : tool === 'pen' || tool === 'eraser'
          ? stampCells(doc, hover.current.x, hover.current.y, stampOptions)
          : [hover.current]

    rendererRef.current.draw(canvas, doc, { zoom, showGrid, hover: cursor, selection })
    // 미리보기도 같은 경로로 갱신해야 스트로크 중에 한 박자 늦지 않는다.
    onPaint?.()
  }, [doc, zoom, showGrid, onPaint, tool, stampOptions, selection])

  useEffect(() => {
    paint()
  }, [paint])

  const posOf = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    return screenToPixel(canvas, e.clientX, e.clientY, doc)
  }

  const applyAt = (p: { x: number; y: number }, from?: { x: number; y: number }) => {
    const paintColor = tool === 'eraser' ? TRANSPARENT : color

    switch (tool) {
      case 'pen':
      case 'eraser':
        if (from) drawLine(doc, from.x, from.y, p.x, p.y, paintColor, stampOptions)
        else stamp(doc, p.x, p.y, paintColor, stampOptions)
        break
      case 'fill':
        floodFill(doc, p.x, p.y, paintColor)
        break
      case 'line':
        if (origin.current) {
          drawLine(doc, origin.current.x, origin.current.y, p.x, p.y, paintColor, stampOptions)
        }
        break
      case 'rect':
      case 'rectFill':
        if (origin.current) {
          drawRect(
            doc,
            origin.current.x,
            origin.current.y,
            p.x,
            p.y,
            paintColor,
            stampOptions,
            tool === 'rectFill',
          )
        }
        break
      case 'picker':
        break
    }
  }

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    const p = posOf(e)
    if (!p) return

    if (tool === 'picker') {
      onPickColor(getPixel(doc, p.x, p.y))
      return
    }

    if (tool === 'select') {
      e.currentTarget.setPointerCapture(e.pointerId)
      // 선택 안을 누르면 옮기기, 밖을 누르면 새로 선택한다.
      if (selection !== null && containsPoint(selection, p.x, p.y)) {
        onBeforeStroke()
        dragging.current = {
          start: p,
          rect: selection,
          // 옮기는 동안 매 프레임 원본에서 다시 계산해야 잔상이 남지 않는다.
          base: { w: doc.w, h: doc.h, data: new Uint8ClampedArray(doc.data) },
        }
      } else {
        selectAnchor.current = p
        onSelectionChange({ x: p.x, y: p.y, w: 1, h: 1 })
      }
      return
    }

    e.currentTarget.setPointerCapture(e.pointerId)
    onBeforeStroke()

    drawing.current = true
    origin.current = p
    last.current = p
    base.current = SHAPE_TOOLS.has(tool) ? new Uint8ClampedArray(doc.data) : null

    applyAt(p)
    paint()
  }

  /**
   * 스트로크를 한 지점만큼 전진시킨다.
   * pointermove와 pointerup이 같은 경로를 타야 마우스를 떼는 지점이 유실되지 않는다.
   * (채우기는 클릭 한 번으로 끝나므로 두 분기 모두에 걸리지 않는다.)
   */
  const advance = (p: { x: number; y: number }) => {
    if (base.current) {
      // 도형은 매번 원본으로 되돌린 뒤 다시 그려야 잔상이 남지 않는다.
      doc.data.set(base.current)
      applyAt(p)
    } else if (tool === 'pen' || tool === 'eraser') {
      // 프레임 사이에 커서가 멀리 움직여도 선이 끊기지 않게 직선으로 잇는다.
      applyAt(p, last.current ?? undefined)
    }
    last.current = p
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = posOf(e)
    const moved = p?.x !== hover.current?.x || p?.y !== hover.current?.y
    hover.current = p
    onHover(p)

    if (selectAnchor.current !== null && p) {
      const a = selectAnchor.current
      onSelectionChange(clampRect(rectFromPoints(a.x, a.y, p.x, p.y), doc))
      return
    }

    if (dragging.current !== null && p) {
      const d = dragging.current
      const moved = moveRegion(d.base, d.rect, p.x - d.start.x, p.y - d.start.y)
      // 같은 버퍼를 유지해야 부모가 들고 있는 참조가 어긋나지 않는다.
      doc.data.set(moved.doc.data)
      onSelectionChange(moved.rect)
      paint()
      return
    }

    if (drawing.current && p) {
      advance(p)
      paint()
      return
    }
    // 같은 칸 안에서 움직이는 동안에는 다시 그릴 이유가 없다.
    if (moved) paint()
  }

  const endStroke = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (selectAnchor.current !== null) {
      selectAnchor.current = null
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      return
    }

    if (dragging.current !== null) {
      dragging.current = null
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      onDocChanged()
      return
    }

    if (!drawing.current) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }

    // 마지막 pointermove와 pointerup 위치가 다를 수 있다. 펜이면 끝이 잘리고,
    // 도형이면 확정된 크기가 미리보기와 어긋난다.
    const p = posOf(e)
    if (p) {
      advance(p)
      paint()
    }

    drawing.current = false
    origin.current = null
    last.current = null
    base.current = null
    onDocChanged()
  }

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      onPointerLeave={() => {
        hover.current = null
        onHover(null)
        paint()
      }}
      onContextMenu={(e) => e.preventDefault()}
    />
  )
}
