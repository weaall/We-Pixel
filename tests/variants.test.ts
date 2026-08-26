import { describe, expect, it } from 'vitest'
import type { RGBA } from '../src/core/color'
import { toHsl } from '../src/core/color'
import type { PixelDoc } from '../src/core/doc'
import { createDoc, getPixel, setPixel } from '../src/core/doc'
import {
  defaultVariantOptions,
  defaultVariantSetOptions,
  dominantHue,
  makeVariant,
  makeVariants,
  paletteOf,
} from '../src/core/generate/variants'

const BLACK: RGBA = [0, 0, 0, 255]

/** 밝은 면 / 어두운 면 / 외곽선이 있는 작은 그림. 주사위와 같은 구성이다. */
function sample(): PixelDoc {
  const doc = createDoc(4, 4)
  setPixel(doc, 1, 1, [220, 120, 60, 255]) // 밝은 면
  setPixel(doc, 2, 1, [220, 120, 60, 255])
  setPixel(doc, 1, 2, [140, 70, 35, 255]) // 그늘
  setPixel(doc, 2, 2, BLACK) // 외곽선
  return doc
}

function distinctColors(doc: PixelDoc): number {
  const set = new Set<string>()
  for (let i = 0; i < doc.data.length; i += 4) {
    if (doc.data[i + 3] === 0) continue
    set.add(`${doc.data[i]},${doc.data[i + 1]},${doc.data[i + 2]},${doc.data[i + 3]}`)
  }
  return set.size
}

describe('paletteOf', () => {
  it('많이 쓰인 색이 앞에 온다', () => {
    const palette = paletteOf(sample())
    expect(palette[0].count).toBe(2)
    expect(palette[0].color).toEqual([220, 120, 60, 255])
  })

  it('투명은 세지 않는다', () => {
    expect(paletteOf(sample())).toHaveLength(3)
    expect(paletteOf(createDoc(4, 4))).toHaveLength(0)
  })
})

describe('dominantHue', () => {
  it('색조 축을 넘어가도 가운데를 잡는다', () => {
    // 350°와 10°의 산술 평균은 180°(청록)이다. 원형 평균이어야 0° 근처가 나온다.
    const doc = createDoc(2, 1)
    setPixel(doc, 0, 0, [255, 0, 21, 255]) // 355°
    setPixel(doc, 1, 0, [255, 21, 0, 255]) // 5°
    const h = dominantHue(paletteOf(doc)) ?? -1
    expect(Math.min(h, 360 - h)).toBeLessThan(15)
  })

  it('외곽선 검정이 아무리 많아도 대표색을 끌어당기지 않는다', () => {
    const doc = createDoc(10, 10)
    for (let i = 0; i < 90; i++) setPixel(doc, i % 10, Math.floor(i / 10), BLACK)
    setPixel(doc, 0, 9, [40, 120, 220, 255]) // 파랑 한 점
    const h = dominantHue(paletteOf(doc)) ?? -1
    expect(h).toBeGreaterThan(180)
    expect(h).toBeLessThan(260)
  })

  it('무채색만 있으면 색조가 없다', () => {
    const doc = createDoc(2, 1)
    setPixel(doc, 0, 0, BLACK)
    setPixel(doc, 1, 0, [128, 128, 128, 255])
    expect(dominantHue(paletteOf(doc))).toBeNull()
  })
})

describe('makeVariant', () => {
  it('형태가 한 바이트도 바뀌지 않는다', () => {
    const src = sample()
    const out = makeVariant(src, { ...defaultVariantOptions, hue: 210 })
    expect(out.w).toBe(src.w)
    expect(out.h).toBe(src.h)
    for (let i = 3; i < src.data.length; i += 4) {
      expect(out.data[i]).toBe(src.data[i])
    }
  })

  it('같은 색이던 픽셀은 변형 뒤에도 같은 색이다', () => {
    // 색이 뭉치면 명암 단계가 사라져 형태가 납작해 보인다.
    const src = sample()
    const out = makeVariant(src, { ...defaultVariantOptions, hue: 300 })
    expect(distinctColors(out)).toBe(distinctColors(src))
  })

  it('원래 색조를 그대로 넣으면 원본과 사실상 같다', () => {
    const src = sample()
    const hue = dominantHue(paletteOf(src))
    expect(hue).not.toBeNull()
    const out = makeVariant(src, { ...defaultVariantOptions, hue: hue as number })
    for (let i = 0; i < src.data.length; i++) {
      expect(Math.abs(out.data[i] - src.data[i])).toBeLessThanOrEqual(2)
    }
  })

  it('색조를 옮기면 실제로 다른 색이 된다', () => {
    const src = sample()
    const out = makeVariant(src, { ...defaultVariantOptions, hue: 210 })
    const before = toHsl(getPixel(src, 1, 1))
    const after = toHsl(getPixel(out, 1, 1))
    const d = Math.abs(((after.h - before.h + 540) % 360) - 180)
    expect(d).toBeGreaterThan(60)
  })

  it('밝은 면과 그늘의 순서가 뒤집히지 않는다', () => {
    const src = sample()
    const out = makeVariant(src, { ...defaultVariantOptions, hue: 210, contrast: 1.4 })
    expect(toHsl(getPixel(out, 1, 1)).l).toBeGreaterThan(toHsl(getPixel(out, 1, 2)).l)
  })

  it('keepNeutral 이면 외곽선 검정은 손대지 않는다', () => {
    const src = sample()
    const kept = makeVariant(src, { ...defaultVariantOptions, hue: 210, keepNeutral: true })
    expect(getPixel(kept, 2, 2)).toEqual(BLACK)

    const tinted = makeVariant(src, { ...defaultVariantOptions, hue: 210, keepNeutral: false })
    expect(getPixel(tinted, 2, 2)).toEqual(BLACK) // 순검정은 명도가 0이라 색조가 붙지 않는다
  })

  it('투명한 곳은 투명하게 남는다', () => {
    const out = makeVariant(sample(), { ...defaultVariantOptions, hue: 90 })
    expect(getPixel(out, 0, 0)[3]).toBe(0)
  })

  it('명암 폭을 키우면 밝고 어두운 차이가 벌어진다', () => {
    const src = sample()
    const flat = makeVariant(src, { ...defaultVariantOptions, hue: 210, contrast: 0.4 })
    const sharp = makeVariant(src, { ...defaultVariantOptions, hue: 210, contrast: 1.6 })
    const gap = (d: PixelDoc) => toHsl(getPixel(d, 1, 1)).l - toHsl(getPixel(d, 1, 2)).l
    expect(gap(sharp)).toBeGreaterThan(gap(flat))
  })
})

describe('makeVariants', () => {
  it('요청한 수만큼 만든다', () => {
    expect(makeVariants(sample(), { ...defaultVariantSetOptions, count: 6 })).toHaveLength(6)
  })

  it('간격을 주지 않으면 색조를 고르게 나눈다', () => {
    const out = makeVariants(sample(), { ...defaultVariantSetOptions, count: 4, hue: 0 })
    expect(out.map((v) => v.hue)).toEqual([0, 90, 180, 270])
  })

  it('간격을 주면 그만큼씩 옮긴다', () => {
    const out = makeVariants(sample(), { ...defaultVariantSetOptions, count: 3, hue: 350, step: 20 })
    expect(out.map((v) => v.hue)).toEqual([350, 10, 30])
  })

  it('모든 변형의 형태가 원본과 같다', () => {
    const src = sample()
    for (const v of makeVariants(src, { ...defaultVariantSetOptions, count: 5 })) {
      for (let i = 3; i < src.data.length; i += 4) expect(v.doc.data[i]).toBe(src.data[i])
    }
  })

  it('변형끼리 서로 다른 색이 나온다', () => {
    const out = makeVariants(sample(), { ...defaultVariantSetOptions, count: 4, hue: 0 })
    const keys = out.map((v) => v.doc.data.join(','))
    expect(new Set(keys).size).toBe(4)
  })

  it('빈 캔버스에도 터지지 않는다', () => {
    const out = makeVariants(createDoc(4, 4), { ...defaultVariantSetOptions, count: 3 })
    expect(out).toHaveLength(3)
    expect(out[0].doc.data.every((b) => b === 0)).toBe(true)
  })
})
