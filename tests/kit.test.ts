import { describe, expect, it } from 'vitest'
import { parseHex, toHsl } from '../src/core/color'
import { BUTTON_PRESETS, BUTTON_ROLE_LIST, BUTTON_STATES } from '../src/core/generate/button'
import { DICE_ROLE_LIST } from '../src/core/generate/diceSet'
import { KIT_ROLE_LIST, defaultKitSizes, kitFromRoles, kitFromTone, missingKitRoles } from '../src/core/generate/kit'

describe('KIT_ROLE_LIST', () => {
  it('두 가족의 자리를 모두 담는다', () => {
    expect(KIT_ROLE_LIST).toHaveLength(DICE_ROLE_LIST.length + BUTTON_ROLE_LIST.length)
  })

  it('이름이 겹치지 않는다', () => {
    // outline 은 양쪽에 다 있다. 접두어가 없으면 하나가 다른 하나를 덮는다.
    expect(new Set(KIT_ROLE_LIST.map((e) => e.role)).size).toBe(KIT_ROLE_LIST.length)
    expect(KIT_ROLE_LIST.some((e) => e.role === 'dice.outline')).toBe(true)
    expect(KIT_ROLE_LIST.some((e) => e.role === 'ui.outline')).toBe(true)
  })
})

describe('kitFromTone', () => {
  it('주사위 열둘, 버튼 넷, 패널 하나가 나온다', () => {
    const kit = kitFromTone(BUTTON_PRESETS[0].tone)
    expect(kit.dice).toHaveLength(12)
    expect(kit.button.map((b) => b.state)).toEqual([...BUTTON_STATES])
    expect(kit.panel.w).toBe(defaultKitSizes.panel.w)
  })

  it('주사위 눈이 몸통과 뚜렷하게 다르다', () => {
    // 비슷하면 눈이 몇 개인지 안 읽힌다.
    const kit = kitFromTone({ ...BUTTON_PRESETS[3].tone })
    const pal = kit.dice[0].spec.palette
    const hueOf = (role: string) =>
      toHsl(parseHex(pal[DICE_ROLE_LIST.find((e) => e.role === role)!.char])!).h
    const gap = Math.abs(((hueOf('pipLit') - hueOf('faceLit') + 540) % 360) - 180)
    expect(gap).toBeGreaterThan(90)
  })

  it('버튼과 패널이 같은 배색을 쓴다', () => {
    // 다르면 한 세계의 물건으로 보이지 않는다.
    const kit = kitFromTone(BUTTON_PRESETS[2].tone)
    expect(kit.panel.palette).toEqual(kit.button[0].spec.palette)
  })

  it('톤을 바꾸면 둘 다 바뀐다', () => {
    const a = kitFromTone({ ...BUTTON_PRESETS[0].tone, hue: 20, saturationBoost: 0.4 })
    const b = kitFromTone({ ...BUTTON_PRESETS[0].tone, hue: 200, saturationBoost: 0.4 })
    expect(a.dice[0].spec.palette).not.toEqual(b.dice[0].spec.palette)
    expect(a.button[0].spec.palette).not.toEqual(b.button[0].spec.palette)
  })
})

describe('kitFromRoles', () => {
  it('접두어로 갈라 각 가족에게 넘긴다', () => {
    const kit = kitFromRoles([
      { char: 'dice.faceLit', hex: '#00ff88' },
      { char: 'ui.face', hex: '#ff0088' },
    ])
    const diceChar = DICE_ROLE_LIST.find((e) => e.role === 'faceLit')!.char
    const uiChar = BUTTON_ROLE_LIST.find((e) => e.role === 'face')!.char
    expect(kit.dice[0].spec.palette[diceChar]).toBe('#00ff88')
    expect(kit.button[0].spec.palette[uiChar]).toBe('#ff0088')
  })

  it('접두어 없는 이름은 무시한다', () => {
    // outline 만 오면 어느 쪽 것인지 알 수 없다.
    const kit = kitFromRoles([{ char: 'outline', hex: '#00ff88' }])
    const before = kitFromRoles([])
    expect(kit.dice[0].spec.palette).toEqual(before.dice[0].spec.palette)
  })

  it('한쪽만 와도 나머지는 원래 색으로 남는다', () => {
    const kit = kitFromRoles([{ char: 'ui.face', hex: '#ff0088' }])
    expect(kit.dice).toHaveLength(12)
    expect(kit.button).toHaveLength(4)
  })
})

describe('missingKitRoles', () => {
  it('빠뜨린 자리를 알려준다', () => {
    expect(missingKitRoles([])).toHaveLength(KIT_ROLE_LIST.length)
    expect(missingKitRoles(KIT_ROLE_LIST.map((e) => ({ char: e.role, hex: e.hex })))).toHaveLength(0)
  })
})
