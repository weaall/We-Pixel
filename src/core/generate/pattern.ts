import { fromHsl } from '../color'
import type { PixelDoc } from '../doc'
import { createDoc, setPixel } from '../doc'
import { Perlin } from './perlin'
import { mulberry32 } from './rng'

export interface PatternOptions {
  w: number
  h: number
  seed: number
  hue: number
  /** 명암 단계 수. 픽셀 아트는 단계가 적을수록 깔끔하다. */
  steps: number
  /** 값이 클수록 무늬가 잘게 쪼개진다. */
  detail: number
  octaves: number
  /** 상하좌우가 이어지는 타일을 만든다. */
  seamless: boolean
}

export const defaultPatternOptions: Omit<PatternOptions, 'seed'> = {
  w: 32,
  h: 32,
  hue: 140,
  steps: 4,
  detail: 3.5,
  octaves: 3,
  seamless: false,
}

/** 지형 타일, 텍스처, 배경용 무늬. */
export function generatePattern(o: PatternOptions): PixelDoc {
  const perlin = new Perlin(mulberry32(o.seed))
  const doc = createDoc(o.w, o.h)
  const steps = Math.max(2, Math.floor(o.steps))

  // 단계별 색: 어두운 쪽에서 밝은 쪽으로. 채도는 밝을수록 살짝 낮춘다.
  const ramp = Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1)
    return fromHsl(o.hue + t * 14, 0.55 - t * 0.18, 0.22 + t * 0.5)
  })

  for (let y = 0; y < o.h; y++) {
    for (let x = 0; x < o.w; x++) {
      const v = o.seamless
        ? seamlessValue(perlin, x, y, o)
        : perlin.fbm((x * o.detail) / o.w, (y * o.detail) / o.h, o.octaves) * 0.5 + 0.5

      const idx = Math.min(steps - 1, Math.max(0, Math.floor(v * steps)))
      setPixel(doc, x, y, ramp[idx])
    }
  }
  return doc
}

/**
 * 이음선 없는 타일: 캔버스 좌표를 원환면(torus) 위의 점으로 보고
 * 네 모서리 샘플을 이중 선형 보간해 경계에서 값이 일치하게 만든다.
 */
function seamlessValue(perlin: Perlin, x: number, y: number, o: PatternOptions): number {
  const fx = x / o.w
  const fy = y / o.h
  const s = o.detail
  const a = perlin.fbm(fx * s, fy * s, o.octaves)
  const b = perlin.fbm((fx - 1) * s, fy * s, o.octaves)
  const c = perlin.fbm(fx * s, (fy - 1) * s, o.octaves)
  const d = perlin.fbm((fx - 1) * s, (fy - 1) * s, o.octaves)
  const v =
    a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
  return Math.min(1, Math.max(0, v * 0.5 + 0.5))
}
