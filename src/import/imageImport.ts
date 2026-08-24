import type { PixelDoc } from '../core/doc'
import { MAX_SIZE, MIN_SIZE } from '../core/doc'
import type { QuantizeOptions } from '../core/quantize'
import { quantize } from '../core/quantize'
import type { ResampleMode } from '../core/resample'
import { detectPixelScale, resample } from '../core/resample'

export interface ImageImportOptions extends QuantizeOptions {
  w: number
  h: number
  mode: ResampleMode
  /** 가로세로 비율을 유지해 목표 크기 안에 맞춘다. */
  keepAspect: boolean
}

export interface ImageImportResult {
  doc: PixelDoc
  source: { w: number; h: number }
  /** 원본이 정수배로 확대된 픽셀 아트로 보이면 그 배수. 아니면 1. */
  detectedScale: number
  /** 사용자에게 알려야 할 판단들. 조용히 처리하면 결과가 왜 이런지 알 수 없다. */
  notes: string[]
}

const MAX_SOURCE_PIXELS = 40_000_000

/** 원본 비율을 유지하면서 목표 상자 안에 들어가는 크기. */
export function fitInside(
  srcW: number,
  srcH: number,
  boxW: number,
  boxH: number,
): { w: number; h: number } {
  const scale = Math.min(boxW / srcW, boxH / srcH)
  return {
    w: Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(srcW * scale))),
    h: Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(srcH * scale))),
  }
}

/** 파일에서 원본 크기 그대로 문서를 만든다. */
async function decode(file: Blob): Promise<PixelDoc> {
  const bitmap = await createImageBitmap(file)
  try {
    if (bitmap.width * bitmap.height > MAX_SOURCE_PIXELS) {
      throw new Error(
        `이미지가 너무 큽니다 (${bitmap.width}x${bitmap.height}). 4000만 픽셀 이하로 줄여주세요.`,
      )
    }
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('2D 컨텍스트를 만들 수 없습니다.')
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(bitmap, 0, 0)
    const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    return { w: bitmap.width, h: bitmap.height, data: img.data }
  } finally {
    bitmap.close()
  }
}

/**
 * 이미지 파일을 픽셀 아트 문서로 변환한다.
 *
 * 순서가 중요하다: 축소를 먼저 하고 색을 줄인다. 반대로 하면 원본 해상도에서
 * 수만 색을 양자화하느라 느리고, 축소하면서 다시 중간색이 생겨 팔레트가 어긋난다.
 */
export async function imageToDoc(
  file: Blob,
  options: ImageImportOptions,
): Promise<ImageImportResult> {
  const source = await decode(file)
  const notes: string[] = []

  const detectedScale = detectPixelScale(source)
  if (detectedScale > 1 && options.mode === 'area') {
    notes.push(
      `원본이 ${detectedScale}배로 확대된 픽셀 아트로 보입니다. "원본 도트 유지"를 켜면 더 선명합니다.`,
    )
  }

  const target = options.keepAspect
    ? fitInside(source.w, source.h, options.w, options.h)
    : { w: options.w, h: options.h }

  if (target.w !== options.w || target.h !== options.h) {
    notes.push(`비율을 유지해 ${target.w}x${target.h} 로 맞췄습니다.`)
  }

  const scaled = resample(source, target.w, target.h, options.mode)
  const result = quantize(scaled, options)

  const used = countColors(result)
  if (used < options.colors) {
    notes.push(`원본 색이 적어 ${used}색으로 끝났습니다 (요청 ${options.colors}색).`)
  }

  return { doc: result, source: { w: source.w, h: source.h }, detectedScale, notes }
}

function countColors(doc: PixelDoc): number {
  const seen = new Set<number>()
  for (let i = 0; i < doc.data.length; i += 4) {
    if (doc.data[i + 3] === 0) continue
    seen.add((doc.data[i] << 16) | (doc.data[i + 1] << 8) | doc.data[i + 2])
  }
  return seen.size
}

export const IMAGE_MIME = 'image/'

export function isImageFile(file: File): boolean {
  return file.type.startsWith(IMAGE_MIME)
}
