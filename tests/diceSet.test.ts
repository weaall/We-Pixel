import { describe, expect, it } from 'vitest'
import { toSpec } from '../src/core/codec'
import type { PixelDoc } from '../src/core/doc'
import { DICE_PALETTE } from '../src/core/generate/diceFrames'
import {
  DICE_TOPS,
  dicePalette,
  dicePaletteList,
  diceDoc,
  diceSetFromPalette,
  diceSetSpecs,
  diceSetSpecsFrom,
  isRealDice,
  makeDiceSet,
} from '../src/core/generate/diceSet'
import { defaultVariantOptions, paletteOf } from '../src/core/generate/variants'

/** 문자 이름을 지운 배치. "어느 칸끼리 같은 색인가" 만 남는다. */
function shapeOf(doc: PixelDoc): string {
  const seen = new Map<string, number>()
  return toSpec(doc)
    .rows.map((row) =>
      [...row].map((ch) => {
        if (!seen.has(ch)) seen.set(ch, seen.size)
        return seen.get(ch)
      }).join(','),
    )
    .join('|')
}

describe('makeDiceSet', () => {
  it('여섯 개가 나오고 윗면이 1~6 이다', () => {
    const set = makeDiceSet({ ...defaultVariantOptions, hue: 200 })
    expect(set.map((d) => d.top)).toEqual([1, 2, 3, 4, 5, 6])
    for (const d of set) expect(d.pips[0]).toBe(d.top)
  })

  it('여섯 개가 같은 색 패턴을 쓴다', () => {
    // 세트의 요건이다. 장마다 매핑을 다시 만들면 같은 회색이 장마다 다른 색이
    // 되어 따로 만든 주사위처럼 보인다.
    const set = makeDiceSet({ ...defaultVariantOptions, hue: 200 })
    const bodyColors = (doc: PixelDoc) =>
      new Set(paletteOf(doc).map((e) => e.color.join(',')))

    // 1번은 눈이 하나라 붉은 계열이 적을 수 있다. 6번의 색은 1번의 색을 포함해야 한다.
    const six = bodyColors(set[5].doc)
    for (const d of set) for (const c of bodyColors(d.doc)) expect(six.has(c)).toBe(true)
  })

  it('눈 배치를 건드리지 않는다', () => {
    for (const top of DICE_TOPS) {
      const before = shapeOf(diceDoc(top))
      const after = shapeOf(makeDiceSet({ ...defaultVariantOptions, hue: 300 })[top - 1].doc)
      expect(after).toBe(before)
    }
  })

  it('색조를 바꾸면 실제로 다른 색이 나온다', () => {
    const a = makeDiceSet({ ...defaultVariantOptions, hue: 200 })[0].doc
    const b = makeDiceSet({ ...defaultVariantOptions, hue: 20 })[0].doc
    expect(Array.from(a.data)).not.toEqual(Array.from(b.data))
  })

  it('같은 옵션이면 같은 결과다', () => {
    const a = makeDiceSet({ ...defaultVariantOptions, hue: 140 })[2].doc
    const b = makeDiceSet({ ...defaultVariantOptions, hue: 140 })[2].doc
    expect(Array.from(a.data)).toEqual(Array.from(b.data))
  })
})

describe('dicePalette', () => {
  it('투명은 빼고 빈도와 함께 돌려준다', () => {
    const list = dicePalette()
    expect(list.length).toBe(Object.keys(DICE_PALETTE).length - 1)
    for (const e of list) expect(e.count).toBeGreaterThan(0)
    // 많이 쓰인 색이 앞에 온다.
    for (let i = 1; i < list.length; i++) expect(list[i - 1].count).toBeGreaterThanOrEqual(list[i].count)
  })

  it('여섯 장을 다 세므로 한 장짜리보다 크다', () => {
    // 한 장만 세면 그 장의 눈 개수에 따라 붉은 계열 비중이 달라져 색조가 흔들린다.
    const total = dicePalette().reduce((a, e) => a + e.count, 0)
    const one = paletteOf(diceDoc(1)).reduce((a, e) => a + e.count, 0)
    expect(total).toBeGreaterThan(one * 5)
  })
})

describe('diceSetFromPalette', () => {
  it('모델이 준 색을 입힌다', () => {
    const list = dicePaletteList()
    const set = diceSetFromPalette([{ char: list[0].char, hex: '#0055ff' }])
    const used = paletteOf(set[0].doc).map((e) => e.color.slice(0, 3).join(','))
    expect(used).toContain('0,85,255')
  })

  it('빠뜨린 색은 원래대로 남는다', () => {
    // 구멍이 뚫리느니 원래 색이 낫다.
    const set = diceSetFromPalette([])
    expect(Array.from(set[0].doc.data)).toEqual(Array.from(diceDoc(1).data))
  })

  it('엉뚱한 문자와 잘못된 hex 는 무시한다', () => {
    const set = diceSetFromPalette([
      { char: 'Z', hex: '#0055ff' },
      { char: 'ab', hex: '#0055ff' },
      { char: dicePaletteList()[0].char, hex: 'nope' },
      { char: '.', hex: '#0055ff' },
    ])
    expect(Array.from(set[0].doc.data)).toEqual(Array.from(diceDoc(1).data))
  })

  it('투명은 칠하지 못한다', () => {
    // 투명을 색으로 만들면 실루엣이 사각형이 된다.
    const set = diceSetFromPalette([{ char: '.', hex: '#0055ff' }])
    expect(set[0].doc.data[3]).toBe(0)
  })

  it('여섯 개 모두에 같은 팔레트가 들어간다', () => {
    const list = dicePaletteList()
    const set = diceSetFromPalette(list.map((e, i) => ({ char: e.char, hex: i === 0 ? '#0055ff' : e.hex })))
    for (const d of set) {
      const used = paletteOf(d.doc).map((e) => e.color.slice(0, 3).join(','))
      expect(used).toContain('0,85,255')
    }
  })
})

describe('isRealDice', () => {
  it('마주보는 면의 합이 7이면 참이다', () => {
    expect(isRealDice([1, 4, 5])).toBe(true)
    expect(isRealDice([6, 2, 3])).toBe(true)
  })

  it('같은 눈이 두 번 보이거나 1과 6이 함께면 거짓이다', () => {
    expect(isRealDice([3, 3, 5])).toBe(false)
    expect(isRealDice([1, 6, 3])).toBe(false)
  })

  it('범위를 벗어나면 거짓이다', () => {
    expect(isRealDice([0, 2, 3])).toBe(false)
    expect(isRealDice([7, 2, 3])).toBe(false)
    expect(isRealDice([1, 2])).toBe(false)
  })

  it('구운 프레임이 전부 통과한다', () => {
    for (const d of makeDiceSet({ ...defaultVariantOptions, hue: 0 })) {
      expect(isRealDice(d.pips)).toBe(true)
    }
  })
})

describe('세트가 문자까지 공유한다', () => {
  it('여섯 장의 팔레트가 완전히 같다', () => {
    // 결과를 toSpec 으로 다시 매기면 장마다 색의 등장 순서가 달라 같은 회색이
    // 다른 문자가 된다. 그러면 배색 하나를 여섯 장에 다시 입힐 수 없다.
    const specs = diceSetSpecs({ ...defaultVariantOptions, hue: 200 })
    const first = JSON.stringify(specs[0].spec.palette)
    for (const s of specs) expect(JSON.stringify(s.spec.palette)).toBe(first)
  })

  it('눈은 서로 다르다', () => {
    const specs = diceSetSpecs({ ...defaultVariantOptions, hue: 200 })
    const rows = specs.map((s) => s.spec.rows.join(''))
    expect(new Set(rows).size).toBe(6)
  })

  it('모델이 준 배색도 문자를 유지한다', () => {
    const list = dicePaletteList()
    const specs = diceSetSpecsFrom([{ char: list[0].char, hex: '#0055ff' }])
    for (const s of specs) expect(s.spec.palette[list[0].char]).toBe('#0055ff')
  })

  it('원본 문자 집합이 그대로다', () => {
    const before = Object.keys(DICE_PALETTE).sort()
    const after = Object.keys(diceSetSpecs({ ...defaultVariantOptions, hue: 90 })[0].spec.palette).sort()
    expect(after).toEqual(before)
  })

  it('투명은 색으로 바뀌지 않는다', () => {
    const specs = diceSetSpecs({ ...defaultVariantOptions, hue: 90, keepNeutral: false })
    expect(specs[0].spec.palette['.']).toBe('transparent')
  })
})
