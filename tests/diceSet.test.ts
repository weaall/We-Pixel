import { describe, expect, it } from 'vitest'
import { toSpec } from '../src/core/codec'
import type { PixelDoc } from '../src/core/doc'
import { DICE_PALETTE } from '../src/core/generate/diceFrames'
import { parseHex, toHsl } from '../src/core/color'
import {
  DICE_TOPS,
  dicePalette,
  dicePaletteList,
  diceDoc,
  diceSetFromPalette,
  DICE_PRESETS,
  DICE_ROLE_LIST,
  defaultDiceTone,
  diceSetSpecs,
  diceSetSpecsFrom,
  diceSetSpecsFromRoles,
  diceSetSpecsToned,
  diceTonedPalette,
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
  it('열두 개가 나온다 — 등축 여섯, 정면 여섯', () => {
    const set = makeDiceSet({ ...defaultVariantOptions, hue: 200 })
    expect(set).toHaveLength(12)
    expect(set.filter((d) => d.kind === 'iso').map((d) => d.top)).toEqual([1, 2, 3, 4, 5, 6])
    expect(set.filter((d) => d.kind === 'face').map((d) => d.top)).toEqual([1, 2, 3, 4, 5, 6])
    // 앞면 눈은 파일 이름과 맞아야 한다.
    for (const d of set) expect(d.pips[0]).toBe(d.top)
  })

  it('열두 개가 같은 색 패턴을 쓴다', () => {
    // 세트의 요건이다. 장마다 매핑을 다시 만들면 같은 회색이 장마다 다른 색이
    // 되어 따로 만든 주사위처럼 보인다.
    const set = makeDiceSet({ ...defaultVariantOptions, hue: 200 })
    const bodyColors = (doc: PixelDoc) =>
      new Set(paletteOf(doc).map((e) => e.color.join(',')))

    // 1번은 눈이 하나라 붉은 계열이 적을 수 있다. 6번의 색은 1번의 색을 포함해야 한다.
    // 눈이 여섯인 장이 색을 가장 많이 쓴다. 나머지는 그 부분집합이어야 한다.
    const widest = new Set([
      ...bodyColors(set[5].doc),
      ...bodyColors(set[11].doc),
    ])
    for (const d of set) for (const c of bodyColors(d.doc)) expect(widest.has(c)).toBe(true)
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

  it('구운 등축 프레임이 전부 통과한다', () => {
    // 정면은 한 면만 보이므로 뒤 둘이 0 이다. 규칙을 물을 대상이 아니다.
    for (const d of makeDiceSet({ ...defaultVariantOptions, hue: 0 })) {
      if (d.kind !== 'iso') continue
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
    expect(new Set(rows).size).toBe(12)
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

describe('역할별 톤', () => {
  it('몸통과 눈이 따로 움직인다', () => {
    // 하나로 묶으면 색조를 옮길 때 붉은 눈이 몸통을 따라 파랗게 끌려간다.
    const pal = diceTonedPalette({
      body: { ...defaultDiceTone, hue: 210, saturationBoost: 0.4 },
      pip: { ...defaultDiceTone, hue: 350 },
    })
    const roleHex = (role: string) =>
      pal[DICE_ROLE_LIST.find((e) => e.role === role)!.char]
    const bodyHue = toHsl(parseHex(roleHex('faceLit'))!).h
    const pipHue = toHsl(parseHex(roleHex('pipLit'))!).h
    expect(Math.abs(bodyHue - 210)).toBeLessThan(40)
    expect(Math.min(Math.abs(pipHue - 350), Math.abs(pipHue + 10))).toBeLessThan(40)
  })

  it('채도 더하기가 회색을 색으로 만든다', () => {
    // 배율만으로는 안 된다. 0에 무엇을 곱해도 0이다.
    const flat = diceTonedPalette({
      body: { ...defaultDiceTone, hue: 44, saturation: 2 },
      pip: defaultDiceTone,
    })
    const boosted = diceTonedPalette({
      body: { ...defaultDiceTone, hue: 44, saturationBoost: 0.6 },
      pip: defaultDiceTone,
    })
    const sat = (pal: Record<string, string>) =>
      toHsl(parseHex(pal[DICE_ROLE_LIST.find((e) => e.role === 'faceLit')!.char])!).s
    expect(sat(flat)).toBeLessThan(0.2)
    expect(sat(boosted)).toBeGreaterThan(0.5)
  })

  it('밝기 순서가 유지된다', () => {
    // 깨지면 입체감이 사라져 납작한 육각형으로 보인다.
    for (const p of DICE_PRESETS) {
      const pal = diceTonedPalette(p.tone)
      const l = (role: string) =>
        toHsl(parseHex(pal[DICE_ROLE_LIST.find((e) => e.role === role)!.char])!).l
      expect(l('edge')).toBeGreaterThan(l('faceLit'))
      expect(l('faceLit')).toBeGreaterThan(l('faceShade'))
      expect(l('faceShade')).toBeGreaterThan(l('outline'))
    }
  })

  it('프리셋마다 다른 색이 나온다', () => {
    const seen = new Set(DICE_PRESETS.map((p) => JSON.stringify(diceTonedPalette(p.tone))))
    expect(seen.size).toBe(DICE_PRESETS.length)
  })

  it('톤을 줘도 여섯 장이 같은 팔레트를 쓴다', () => {
    const specs = diceSetSpecsToned(DICE_PRESETS[1].tone)
    const first = JSON.stringify(specs[0].spec.palette)
    for (const s of specs) expect(JSON.stringify(s.spec.palette)).toBe(first)
  })
})

describe('역할 이름으로 받기', () => {
  it('이름으로 색을 입힌다', () => {
    const specs = diceSetSpecsFromRoles([{ char: 'pipLit', hex: '#00ff88' }])
    const char = DICE_ROLE_LIST.find((e) => e.role === 'pipLit')!.char
    expect(specs[0].spec.palette[char]).toBe('#00ff88')
  })

  it('없는 이름과 잘못된 hex 는 무시한다', () => {
    const specs = diceSetSpecsFromRoles([
      { char: 'nope', hex: '#00ff88' },
      { char: 'pipLit', hex: 'green' },
    ])
    const char = DICE_ROLE_LIST.find((e) => e.role === 'pipLit')!.char
    expect(specs[0].spec.palette[char]).toBe(DICE_PALETTE[char])
  })

  it('아홉 자리가 모두 있다', () => {
    expect(DICE_ROLE_LIST).toHaveLength(9)
    expect(new Set(DICE_ROLE_LIST.map((e) => e.role)).size).toBe(9)
  })
})

describe('정면 가족', () => {
  it('등축과 정면이 팔레트를 함께 쓴다', () => {
    // 따로 매기면 배색 하나를 열두 장에 똑같이 입힐 수 없다.
    const specs = diceSetSpecsToned({
      body: { ...defaultDiceTone, hue: 30, saturationBoost: 0.4 },
      pip: defaultDiceTone,
    })
    const first = JSON.stringify(specs[0].spec.palette)
    for (const s of specs) expect(JSON.stringify(s.spec.palette)).toBe(first)
  })

  it('정면은 앞면 하나만 센다', () => {
    for (const d of makeDiceSet({ ...defaultVariantOptions, hue: 0 })) {
      if (d.kind !== 'face') continue
      expect(d.pips).toEqual([d.top, 0, 0])
    }
  })

  it('정면과 등축은 서로 다른 그림이다', () => {
    const set = makeDiceSet({ ...defaultVariantOptions, hue: 0 })
    const iso = set.filter((d) => d.kind === 'iso')
    const face = set.filter((d) => d.kind === 'face')
    for (let i = 0; i < 6; i++) {
      expect(Array.from(face[i].doc.data)).not.toEqual(Array.from(iso[i].doc.data))
    }
  })

  it('열두 장 모두 크기가 같다', () => {
    // 섞이면 시트 슬라이스가 어긋난다.
    for (const d of makeDiceSet({ ...defaultVariantOptions, hue: 0 })) {
      expect(d.doc.w).toBe(64)
      expect(d.doc.h).toBe(64)
    }
  })

  it('배색을 바꾸면 열두 장이 다 따라온다', () => {
    const a = makeDiceSet({ ...defaultVariantOptions, hue: 20, saturationBoost: 0.4 })
    const b = makeDiceSet({ ...defaultVariantOptions, hue: 200, saturationBoost: 0.4 })
    for (let i = 0; i < 12; i++) {
      expect(Array.from(a[i].doc.data)).not.toEqual(Array.from(b[i].doc.data))
    }
  })
})
