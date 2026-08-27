import { useEffect, useRef, useState } from 'react'
import type { PixelDoc } from '../core/doc'

export interface RollPreviewProps {
  frames: ReadonlyArray<PixelDoc>
  /** 한 칸을 보여 줄 시간(ms). */
  fps: number
  box: number
}

/**
 * 굴러가는 것을 실제로 돌려 본다.
 *
 * 칸을 늘어놓기만 하면 타이밍을 판단할 수 없다. 튀는 높이와 눈이 바뀌는 속도는
 * 움직여 봐야 알 수 있다.
 */
export function RollPreview({ frames, fps, box }: RollPreviewProps) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (frames.length === 0) return
    // 칸 수나 속도가 바뀌면 처음부터 다시 돈다.
    setIndex(0)
    const id = setInterval(() => setIndex((i) => (i + 1) % frames.length), Math.max(20, 1000 / fps))
    return () => clearInterval(id)
  }, [frames, fps])

  useEffect(() => {
    const canvas = ref.current
    const doc = frames[index]
    if (canvas === null || doc === undefined) return
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
  }, [frames, index, box])

  return (
    <div className="roll-preview">
      <canvas ref={ref} className="doc-thumb" />
      <span>
        {index + 1} / {frames.length}
      </span>
    </div>
  )
}
