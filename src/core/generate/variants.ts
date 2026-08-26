import type { RGBA } from '../color'
import { fromHsl, toHsl } from '../color'
import type { PixelDoc } from '../doc'
import type { ColorMapping } from '../recolor'
import { replaceColors } from '../recolor'

/** 이보다 채도가 낮으면 색조가 사실상 의미 없다. 외곽선·회색 음영이 여기 걸린다. */
const NEUTRAL_SAT = 0.12

export interface PaletteEntry {
  color: RGBA
  count: number
}

/** 그림에 실제로 쓰인 색을 많이 쓰인 순으로. 투명은 세지 않는다. */
export function paletteOf(doc: PixelDoc): PaletteEntry[] {
  const counts = new Map<number, number>()
  for (let i = 0; i < doc.data.length; i += 4) {
    const a = doc.data[i + 3]
    if (a === 0) continue
    const key =
      ((doc.data[i] << 24) | (doc.data[i + 1] << 16) | (doc.data[i + 2] << 8) | a) >>> 0
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const out: PaletteEntry[] = []
  for (const [key, count] of counts) {
    out.push({
      color: [(key >>> 24) & 255, (key >>> 16) & 255, (key >>> 8) & 255, key & 255],
      count,
    })
  }
  out.sort((a, b) => b.count - a.count)
  return out
}

/**
 * 그림을 대표하는 색조.
 *
 * 평균을 그냥 내면 안 된다. 색조는 원형이라 350°와 10°의 산술 평균은 180°,
 * 즉 정반대 색이 나온다. 단위벡터로 바꿔 더한 뒤 각도를 되찾는다.
 *
 * 무채색은 뺀다. 외곽선 검정이 픽셀 수로는 가장 많은 경우가 흔한데,
 * 그 색조는 0°(빨강)으로 잡혀 대표색을 통째로 끌어당긴다.
 */
export function dominantHue(palette: ReadonlyArray<PaletteEntry>): number | null {
  let x = 0
  let y = 0
  for (const { color, count } of palette) {
    const hsl = toHsl(color)
    if (hsl.s < NEUTRAL_SAT) continue
    // 채도가 높은 색일수록 그림의 색을 잘 대표한다.
    const weight = count * hsl.s
    const rad = (hsl.h * Math.PI) / 180
    x += Math.cos(rad) * weight
    y += Math.sin(rad) * weight
  }
  if (x === 0 && y === 0) return null
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

export interface VariantOptions {
  /** 목표 색조 0-360. */
  hue: number
  /** 채도 배율. 1이면 원본 그대로. */
  saturation: number
  /** 명암 폭 배율. 0.5를 기준으로 밀고 당긴다. */
  contrast: number
  /** 밝기 이동. -0.5 ~ 0.5. */
  brightness: number
  /** 외곽선처럼 채도가 없는 색은 그대로 둔다. */
  keepNeutral: boolean
}

export const defaultVariantOptions: VariantOptions = {
  hue: 30,
  saturation: 1,
  contrast: 1,
  brightness: 0,
  keepNeutral: true,
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const round = (c: RGBA): RGBA => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), c[3]]

/**
 * 색조를 옮기는 매핑을 만든다.
 *
 * 각 색을 목표 색조로 그냥 몰아넣으면 그림이 단색이 된다. 원본이 대표 색조에서
 * 얼마나 벗어나 있었는지를 그대로 옮겨야 한다 — 밝은 면은 따뜻하게, 그늘은
 * 차갑게 틀어둔 픽셀 아트의 색 배치가 이 차이에 들어 있다.
 */
export function variantMappings(
  palette: ReadonlyArray<PaletteEntry>,
  o: VariantOptions,
): ColorMapping[] {
  const base = dominantHue(palette)
  const mappings: ColorMapping[] = []

  for (const { color } of palette) {
    const hsl = toHsl(color)
    if (o.keepNeutral && hsl.s < NEUTRAL_SAT) continue

    // -180 ~ 180 으로 감아야 색조 축을 넘어가도 거리가 뒤집히지 않는다.
    const offset = base === null ? 0 : ((((hsl.h - base) % 360) + 540) % 360) - 180
    // 중간 색이 검정·흰색으로 눌리면 명암 단계가 뭉개져 되돌릴 수 없다.
    // 다만 원래부터 순검정이던 외곽선은 그대로 둔다 — 여기서 #080808 로
    // 들뜨면 색 교체나 내보내기에서 더 이상 같은 색으로 잡히지 않는다.
    const lo = hsl.l <= 0.03 ? 0 : 0.03
    const hi = hsl.l >= 0.97 ? 1 : 0.97
    const to = fromHsl(
      o.hue + offset,
      clamp(hsl.s * o.saturation, 0, 1),
      clamp(0.5 + (hsl.l - 0.5) * o.contrast + o.brightness, lo, hi),
      color[3],
    )
    mappings.push({ from: color, to: round(to) })
  }
  return mappings
}

/**
 * 색만 바꾼 변형을 만든다.
 *
 * 팔레트 매핑으로만 처리하므로 픽셀의 자리와 알파는 한 바이트도 바뀌지 않는다.
 * 형태가 유지된다는 것이 코드로 보장된다 — 부탁이 아니라.
 */
export function makeVariant(doc: PixelDoc, o: VariantOptions): PixelDoc {
  return replaceColors(doc, variantMappings(paletteOf(doc), o)).doc
}

export interface VariantSetOptions extends VariantOptions {
  count: number
  /** 변형 사이 색조 간격. 0이면 360°를 고르게 나눈다. */
  step: number
}

export const defaultVariantSetOptions: VariantSetOptions = {
  ...defaultVariantOptions,
  count: 4,
  step: 0,
}

export interface Variant {
  hue: number
  doc: PixelDoc
}

/** 색조를 옮겨가며 여러 벌을 만든다. 세트를 뽑을 때 쓴다. */
export function makeVariants(doc: PixelDoc, o: VariantSetOptions): Variant[] {
  const count = Math.max(1, Math.floor(o.count))
  const palette = paletteOf(doc)
  const step = o.step > 0 ? o.step : 360 / count

  const out: Variant[] = []
  for (let i = 0; i < count; i++) {
    const hue = ((o.hue + step * i) % 360 + 360) % 360
    // 팔레트를 한 번만 훑고 매핑만 다시 만든다.
    out.push({ hue, doc: replaceColors(doc, variantMappings(palette, { ...o, hue })).doc })
  }
  return out
}
