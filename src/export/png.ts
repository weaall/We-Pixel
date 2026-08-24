import type { PixelDoc } from '../core/doc'

/**
 * 문서를 PNG Blob으로. scale > 1이면 최근접 이웃으로 확대한다.
 *
 * 유니티에 넣을 에셋은 scale=1이 정답이다. 확대본은 SNS 공유나
 * 미리보기용으로만 쓴다 (확대해서 임포트하면 Pixels Per Unit 계산이 어긋난다).
 */
export async function docToPngBlob(doc: PixelDoc, scale = 1): Promise<Blob> {
  const src = document.createElement('canvas')
  src.width = doc.w
  src.height = doc.h
  const sctx = src.getContext('2d')
  if (!sctx) throw new Error('2D 컨텍스트를 만들 수 없습니다')
  sctx.putImageData(new ImageData(doc.data, doc.w, doc.h), 0, 0)

  if (scale === 1) return canvasToBlob(src)

  const out = document.createElement('canvas')
  out.width = doc.w * scale
  out.height = doc.h * scale
  const octx = out.getContext('2d')
  if (!octx) throw new Error('2D 컨텍스트를 만들 수 없습니다')
  octx.imageSmoothingEnabled = false
  octx.drawImage(src, 0, 0, out.width, out.height)
  return canvasToBlob(out)
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('PNG 인코딩에 실패했습니다'))
    }, 'image/png')
  })
}

/** PNG를 파일로 내려준다. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // 즉시 revoke하면 일부 브라우저에서 다운로드가 취소된다.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** 이미지 파일을 문서 크기에 맞춰 읽어온다. PNG 임포트용. */
export async function pngToDoc(file: Blob): Promise<PixelDoc> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('2D 컨텍스트를 만들 수 없습니다')
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(bitmap, 0, 0)
    const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    return { w: bitmap.width, h: bitmap.height, data: img.data }
  } finally {
    bitmap.close()
  }
}
