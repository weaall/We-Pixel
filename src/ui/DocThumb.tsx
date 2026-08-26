import { useEffect, useRef } from 'react'
import type { PixelDoc } from '../core/doc'

export interface DocThumbProps {
  doc: PixelDoc
  /** 한 변의 최대 픽셀 수. 정수 배율로만 키운다. */
  box: number
}

/**
 * 문서를 작게 그려 보여준다.
 *
 * 배율을 정수로 내림해야 픽셀 격자가 어긋나지 않는다. 1.5배 같은 값으로 늘리면
 * 어떤 줄은 두껍고 어떤 줄은 얇아져서 원본에 없던 무늬가 보인다.
 */
export function DocThumb({ doc, box }: DocThumbProps) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (canvas === null) return
    const scale = Math.max(1, Math.floor(box / Math.max(doc.w, doc.h)))
    canvas.width = doc.w * scale
    canvas.height = doc.h * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const buf = document.createElement('canvas')
    buf.width = doc.w
    buf.height = doc.h
    buf.getContext('2d')?.putImageData(new ImageData(doc.data, doc.w, doc.h), 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(buf, 0, 0, canvas.width, canvas.height)
  }, [doc, box])

  return <canvas ref={ref} className="doc-thumb" />
}
