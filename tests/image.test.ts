import { describe, expect, it } from 'vitest'
import type { RGBA } from '../src/core/color'
import { createDoc, getPixel, setPixel } from '../src/core/doc'
import type { PixelDoc } from '../src/core/doc'
import { quantize } from '../src/core/quantize'
import { countMatches, replaceColor, replaceColors } from '../src/core/recolor'
import { detectPixelScale, resample } from '../src/core/resample'

const RED: RGBA = [255, 0, 0, 255]
const BLUE: RGBA = [0, 0, 255, 255]
const BLACK: RGBA = [0, 0, 0, 255]
const CLEAR: RGBA = [0, 0, 0, 0]

function distinctColors(doc: PixelDoc): number {
  const seen = new Set<number>()
  for (let i = 0; i < doc.data.length; i += 4) {
    if (doc.data[i + 3] === 0) continue
    seen.add((doc.data[i] << 16) | (doc.data[i + 1] << 8) | doc.data[i + 2])
  }
  return seen.size
}

function gradient(w: number, h: number): PixelDoc {
  const doc = createDoc(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      setPixel(doc, x, y, [(x * 255) / w, (y * 255) / h, ((x + y) * 255) / (w + h), 255])
    }
  }
  return doc
}

describe('resample', () => {
  it('area는 평균을, nearest는 원본 값을 낸다', () => {
    const doc = createDoc(4, 4)
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        setPixel(doc, x, y, (x + y) % 2 ? [255, 255, 255, 255] : BLACK)
      }
    }
    expect(getPixel(resample(doc, 2, 2, 'area'), 0, 0)[0]).toBeCloseTo(128, -1)

    const near = getPixel(resample(doc, 2, 2, 'nearest'), 0, 0)[0]
    expect([0, 255]).toContain(near)
  })

  it('투명 이웃이 색을 어둡게 만들지 않는다', () => {
    // 프리멀티플라이를 빼먹으면 투명 픽셀의 RGB(0,0,0)가 섞여 경계가 검게 된다.
    const doc = createDoc(2, 1)
    setPixel(doc, 0, 0, RED)
    setPixel(doc, 1, 0, CLEAR)
    const merged = getPixel(resample(doc, 1, 1, 'area'), 0, 0)
    expect(merged[0]).toBe(255)
    expect(merged[1]).toBe(0)
    expect(merged[3]).toBeGreaterThan(0)
  })

  it('같은 크기면 내용이 그대로다', () => {
    const doc = gradient(8, 8)
    const same = resample(doc, 8, 8, 'area')
    expect(Array.from(same.data)).toEqual(Array.from(doc.data))
  })

  it('확대된 픽셀 아트의 배수를 찾아낸다', () => {
    const src = createDoc(8, 8)
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) setPixel(src, x, y, [(x * 31) % 256, (y * 37) % 256, 128, 255])
    }
    expect(detectPixelScale(resample(src, 32, 32, 'nearest'))).toBe(4)
    expect(detectPixelScale(src)).toBe(1)
  })
})

describe('quantize', () => {
  it('색을 요청한 수 이하로 줄인다', () => {
    const doc = gradient(64, 64)
    expect(distinctColors(doc)).toBeGreaterThan(1000)
    expect(distinctColors(quantize(doc, { colors: 8, dither: false, alphaThreshold: 128 })))
      .toBeLessThanOrEqual(8)
  })

  it('많이 요청해도 원본 색 수를 넘지 않는다', () => {
    const doc = createDoc(4, 4)
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) setPixel(doc, x, y, x < 2 ? [10, 20, 30, 255] : [200, 210, 220, 255])
    }
    expect(distinctColors(quantize(doc, { colors: 32, dither: false, alphaThreshold: 128 }))).toBe(2)
  })

  it('알파를 이진화한다', () => {
    const doc = createDoc(4, 1)
    setPixel(doc, 0, 0, [255, 0, 0, 255])
    setPixel(doc, 1, 0, [255, 0, 0, 200])
    setPixel(doc, 2, 0, [255, 0, 0, 100])
    setPixel(doc, 3, 0, [255, 0, 0, 0])
    const q = quantize(doc, { colors: 4, dither: false, alphaThreshold: 128 })
    expect([0, 1, 2, 3].map((x) => getPixel(q, x, 0)[3])).toEqual([255, 255, 0, 0])
  })

  it('완전히 투명한 이미지도 처리한다', () => {
    expect(distinctColors(quantize(createDoc(8, 8), { colors: 8, dither: false, alphaThreshold: 128 })))
      .toBe(0)
  })

  it('디더링을 켜도 색 수 한도를 지킨다', () => {
    const q = quantize(gradient(32, 32), { colors: 6, dither: true, alphaThreshold: 128 })
    expect(distinctColors(q)).toBeGreaterThan(0)
    expect(distinctColors(q)).toBeLessThanOrEqual(6)
  })
})

describe('recolor', () => {
  /** 검정, 투명, 빨강이 한 줄에 있는 문서. 투명의 RGB도 0,0,0 이라 헷갈리기 쉽다. */
  function mixed(): PixelDoc {
    const doc = createDoc(3, 1)
    setPixel(doc, 0, 0, BLACK)
    setPixel(doc, 1, 0, CLEAR)
    setPixel(doc, 2, 0, RED)
    return doc
  }

  it('원본을 건드리지 않는다', () => {
    const doc = mixed()
    replaceColor(doc, RED, BLUE, 0)
    expect(getPixel(doc, 2, 0)).toEqual(RED)
  })

  it('검정을 바꿔도 투명은 그대로다', () => {
    const r = replaceColor(mixed(), BLACK, BLUE, 0)
    expect(r.changed).toBe(1)
    expect(getPixel(r.doc, 1, 0)[3]).toBe(0)
  })

  it('투명을 바꿔도 검정은 그대로다', () => {
    const r = replaceColor(mixed(), CLEAR, BLUE, 0)
    expect(r.changed).toBe(1)
    expect(getPixel(r.doc, 0, 0)).toEqual(BLACK)
    expect(getPixel(r.doc, 1, 0)).toEqual(BLUE)
  })

  it('결과를 투명으로 주면 지우는 동작이 된다', () => {
    const r = replaceColor(mixed(), RED, CLEAR, 0)
    expect(getPixel(r.doc, 2, 0)[3]).toBe(0)
  })

  it('허용 오차가 비슷한 색까지 잡는다', () => {
    const doc = createDoc(3, 1)
    setPixel(doc, 0, 0, RED)
    setPixel(doc, 1, 0, [245, 10, 10, 255])
    setPixel(doc, 2, 0, [0, 255, 0, 255])

    expect(replaceColor(doc, RED, BLUE, 0).changed).toBe(1)
    const loose = replaceColor(doc, RED, BLUE, 30)
    expect(loose.changed).toBe(2)
    // 오차를 올려도 전혀 다른 색까지 먹으면 안 된다
    expect(getPixel(loose.doc, 2, 0)).toEqual([0, 255, 0, 255])
  })

  it('countMatches가 실제 교체 수와 일치한다', () => {
    // UI가 "N픽셀이 바뀝니다"로 보여주는 값이라 어긋나면 바로 거짓말이 된다.
    const doc = createDoc(3, 1)
    setPixel(doc, 0, 0, RED)
    setPixel(doc, 1, 0, [245, 10, 10, 255])
    setPixel(doc, 2, 0, [0, 255, 0, 255])
    for (const tol of [0, 15, 30, 60, 200]) {
      expect(countMatches(doc, RED, tol)).toBe(replaceColor(doc, RED, BLUE, tol).changed)
    }
  })

  it('없는 색은 0을 돌려준다', () => {
    expect(replaceColor(mixed(), [1, 2, 3, 255], BLUE, 0).changed).toBe(0)
  })

  describe('여러 색 한 번에', () => {
    const GREEN: RGBA = [0, 255, 0, 255]

    it('매핑 여러 개를 한 번에 적용한다', () => {
      const r = replaceColors(mixed(), [
        { from: BLACK, to: BLUE },
        { from: RED, to: GREEN },
      ])
      expect(r.changed).toBe(2)
      expect(getPixel(r.doc, 0, 0)).toEqual(BLUE)
      expect(getPixel(r.doc, 2, 0)).toEqual(GREEN)
      expect(getPixel(r.doc, 1, 0)[3]).toBe(0)
    })

    it('연쇄로 적용되지 않는다', () => {
      // A→B 와 B→C 를 함께 주면, 순차 적용은 원래 A 였던 픽셀까지 C 로 만든다.
      // 사용자가 지정한 것은 "A는 B로, B는 C로"이지 "A는 C로"가 아니다.
      const doc = createDoc(2, 1)
      setPixel(doc, 0, 0, RED)
      setPixel(doc, 1, 0, BLUE)
      const r = replaceColors(doc, [
        { from: RED, to: BLUE },
        { from: BLUE, to: GREEN },
      ])
      expect(getPixel(r.doc, 0, 0)).toEqual(BLUE)
      expect(getPixel(r.doc, 1, 0)).toEqual(GREEN)
    })

    it('두 색을 서로 맞바꿀 수 있다', () => {
      const doc = createDoc(2, 1)
      setPixel(doc, 0, 0, RED)
      setPixel(doc, 1, 0, BLUE)
      const r = replaceColors(doc, [
        { from: RED, to: BLUE },
        { from: BLUE, to: RED },
      ])
      expect(getPixel(r.doc, 0, 0)).toEqual(BLUE)
      expect(getPixel(r.doc, 1, 0)).toEqual(RED)
      expect(r.changed).toBe(2)
    })

    it('같은 색으로 두는 매핑은 변경으로 세지 않는다', () => {
      // UI가 모든 색을 행으로 깔고 건드리지 않은 행은 그대로 두므로,
      // 이것을 세면 "N픽셀이 바뀝니다"가 항상 전체 픽셀 수가 된다.
      const r = replaceColors(mixed(), [
        { from: BLACK, to: BLACK },
        { from: RED, to: BLUE },
      ])
      expect(r.changed).toBe(1)
    })

    it('매핑이 없으면 원본 그대로다', () => {
      const doc = mixed()
      const r = replaceColors(doc, [])
      expect(r.changed).toBe(0)
      expect(Array.from(r.doc.data)).toEqual(Array.from(doc.data))
    })

    it('앞선 매핑이 우선한다', () => {
      const doc = createDoc(1, 1)
      setPixel(doc, 0, 0, RED)
      const r = replaceColors(doc, [
        { from: RED, to: BLUE },
        { from: RED, to: GREEN },
      ])
      expect(getPixel(r.doc, 0, 0)).toEqual(BLUE)
    })
  })
})
