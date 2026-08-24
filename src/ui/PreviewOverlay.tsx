import { useCallback, useEffect, useRef, useState } from 'react'
import type { PixelDoc } from '../core/doc'

/**
 * 실제 크기 미리보기.
 *
 * 편집 화면은 한 픽셀을 크게 확대해서 보여주므로, 게임 안에서 실제로 어떻게
 * 보일지는 알 수 없다. 확대해서 잘 그린 그림이 1배율에서 뭉개지는 것은
 * 픽셀 아트에서 가장 흔한 함정이다. 그래서 1x를 항상 같이 띄운다.
 *
 * 문서 크기에 따라 표시할 배율을 고른다 — 128px 스프라이트를 4배로 띄우면
 * 오버레이가 캔버스를 다 가린다.
 */

const MAX_PREVIEW_PX = 160
const CANDIDATE_SCALES = [1, 2, 4] as const

export interface PreviewOverlayProps {
  doc: PixelDoc
  /**
   * 다시 그릴 함수를 부모에 등록한다.
   *
   * 스트로크 중에는 CanvasView가 React를 거치지 않고 직접 그리므로, 미리보기도
   * 같은 경로로 갱신해야 한 박자 늦지 않는다. setState로 묶으면 pointermove마다
   * 렌더가 돌아 입력이 무거워진다.
   */
  registerRedraw: (fn: (() => void) | null) => void
}

export function PreviewOverlay({ doc, registerRedraw }: PreviewOverlayProps) {
  const [collapsed, setCollapsed] = useState(false)
  const canvasRefs = useRef(new Map<number, HTMLCanvasElement>())
  const buffer = useRef<HTMLCanvasElement | null>(null)

  const scales = CANDIDATE_SCALES.filter(
    (s) => s === 1 || Math.max(doc.w, doc.h) * s <= MAX_PREVIEW_PX,
  )

  const redraw = useCallback(() => {
    if (collapsed) return

    if (buffer.current === null) buffer.current = document.createElement('canvas')
    const buf = buffer.current
    if (buf.width !== doc.w || buf.height !== doc.h) {
      buf.width = doc.w
      buf.height = doc.h
    }
    const bctx = buf.getContext('2d')
    if (!bctx) return
    bctx.clearRect(0, 0, doc.w, doc.h)
    bctx.putImageData(new ImageData(doc.data, doc.w, doc.h), 0, 0)

    for (const [scale, canvas] of canvasRefs.current) {
      const w = doc.w * scale
      const h = doc.h * scale
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      ctx.clearRect(0, 0, w, h)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(buf, 0, 0, w, h)
    }
  }, [doc, collapsed])

  useEffect(() => {
    redraw()
  }, [redraw])

  useEffect(() => {
    registerRedraw(redraw)
    return () => registerRedraw(null)
  }, [registerRedraw, redraw])

  return (
    <div className={`preview-overlay${collapsed ? ' collapsed' : ''}`}>
      <button
        className="preview-toggle"
        onClick={() => setCollapsed((v) => !v)}
        title={collapsed ? '실제 크기 미리보기 펼치기' : '접기'}
      >
        {collapsed ? '실제 크기 ▲' : '실제 크기 ▼'}
      </button>

      {!collapsed && (
        <div className="preview-row">
          {scales.map((scale) => (
            <div className="preview-cell" key={scale}>
              <canvas
                ref={(el) => {
                  if (el) canvasRefs.current.set(scale, el)
                  else canvasRefs.current.delete(scale)
                }}
              />
              <span>{scale}x</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
