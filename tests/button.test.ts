import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { toSpec } from '../src/core/codec'
import type { PixelSpec } from '../src/core/codec'
import { parseHex, toHsl } from '../src/core/color'
import {
  BUTTON_PRESETS,
  BUTTON_ROLE_LIST,
  BUTTON_STATES,
  MIN_BUTTON_H,
  MIN_BUTTON_W,
  buttonPalette,
  buttonSet,
  buttonSetFromRoles,
  buttonSpec,
  defaultButtonTone,
  statePalette,
} from '../src/core/generate/button'
import { BUTTON_BORDER, BUTTON_PALETTE, BUTTON_ROLE_OF } from '../src/core/generate/buttonFrame'
import { decodePng } from '../src/import/pngDecode'
import { toLogicalGrid } from '../src/core/resample'

function fixture(name: string): PixelSpec {
  return toSpec(toLogicalGrid(decodePng(readFileSync(join(__dirname, 'fixtures', `${name}.png`)))).doc)
}

const roleChar = (role: string) => BUTTON_ROLE_LIST.find((e) => e.role === role)!.char

describe('9-슬라이스', () => {
  it.each([
    [32, 'button-32'],
    [64, 'button-64'],
    [96, 'button-96'],
  ] as const)('%d — 한 장을 늘려 원본을 그대로 만든다', (w, name) => {
    // 늘려서 원본이 나오지 않으면 세 장을 따로 들고 가야 한다.
    const want = fixture(name)
    const got = buttonSpec({ w, h: 32, state: 'normal' })
    expect(got.w).toBe(want.w)
    expect(got.rows).toEqual(want.rows)
    expect(got.palette).toEqual(want.palette)
  })

  it('임의의 크기를 만든다', () => {
    for (const [w, h] of [
      [11, 11],
      [48, 20],
      [120, 40],
      [200, 64],
    ] as const) {
      const s = buttonSpec({ w, h, state: 'normal' })
      expect(s.w).toBe(w)
      expect(s.h).toBe(h)
      expect(new Set(s.rows.map((r) => r.length))).toEqual(new Set([w]))
    }
  })

  it('캡보다 작게는 못 만든다', () => {
    // 캡끼리 겹치면 모서리가 서로 잡아먹는다.
    const s = buttonSpec({ w: 1, h: 1, state: 'normal' })
    expect(s.w).toBe(MIN_BUTTON_W)
    expect(s.h).toBe(MIN_BUTTON_H)
  })

  it('가장자리는 크기가 달라도 그대로다', () => {
    // 여기가 늘어나면 둥근 모서리가 뭉개진다.
    const small = buttonSpec({ w: 32, h: 32, state: 'normal' })
    const big = buttonSpec({ w: 200, h: 32, state: 'normal' })
    for (let y = 0; y < small.h; y++) {
      expect(big.rows[y].slice(0, BUTTON_BORDER.left)).toBe(small.rows[y].slice(0, BUTTON_BORDER.left))
      expect(big.rows[y].slice(-BUTTON_BORDER.right)).toBe(small.rows[y].slice(-BUTTON_BORDER.right))
    }
  })
})

describe('상태', () => {
  it('네 가지가 다 있다', () => {
    expect(BUTTON_STATES).toEqual(['normal', 'hover', 'pressed', 'disabled'])
  })

  it('상태가 달라도 형태는 같다', () => {
    // 크기나 모양이 달라지면 눌렀을 때 옆 요소가 밀린다.
    const rows = BUTTON_STATES.map((state) => buttonSpec({ w: 64, h: 32, state }).rows.join(''))
    expect(new Set(rows).size).toBe(1)
  })

  it('눌리면 경사가 뒤집힌다', () => {
    // 빛을 받던 쪽이 그늘이 되면 같은 그림이 파인 것처럼 보인다.
    const normal = statePalette(BUTTON_PALETTE, 'normal')
    const pressed = statePalette(BUTTON_PALETTE, 'pressed')
    const lit = roleChar('bevelLit')
    const shade = roleChar('bevelShade')
    expect(pressed[lit]).toBe(normal[shade])
    expect(pressed[shade]).toBe(normal[lit])
  })

  it('올리면 밝아진다', () => {
    const face = roleChar('face')
    const before = toHsl(parseHex(statePalette(BUTTON_PALETTE, 'normal')[face])!).l
    const after = toHsl(parseHex(statePalette(BUTTON_PALETTE, 'hover')[face])!).l
    expect(after).toBeGreaterThan(before)
  })

  it('못 쓰는 상태는 색이 빠진다', () => {
    const face = roleChar('face')
    const before = toHsl(parseHex(statePalette(BUTTON_PALETTE, 'normal')[face])!).s
    const after = toHsl(parseHex(statePalette(BUTTON_PALETTE, 'disabled')[face])!).s
    expect(after).toBeLessThan(before)
  })

  it('외곽선은 어느 상태에서도 그대로다', () => {
    // 검정이 회색으로 뜨면 픽셀 아트가 흐릿해 보인다.
    const outline = roleChar('outline')
    for (const state of BUTTON_STATES) {
      expect(statePalette(BUTTON_PALETTE, state)[outline]).toBe(BUTTON_PALETTE[outline])
    }
  })

  it('투명은 색이 되지 않는다', () => {
    for (const state of BUTTON_STATES) {
      expect(statePalette(BUTTON_PALETTE, state)['.']).toBe('transparent')
    }
  })
})

describe('톤', () => {
  it('색조를 옮기면 실제로 달라진다', () => {
    const face = roleChar('face')
    const a = buttonPalette({ ...defaultButtonTone, hue: 213 })[face]
    const b = buttonPalette({ ...defaultButtonTone, hue: 20, saturationBoost: 0.3 })[face]
    expect(a).not.toBe(b)
  })

  it('문자 배정이 그대로다', () => {
    // 바뀌면 상태 팔레트가 엉뚱한 자리를 뒤집는다.
    expect(Object.keys(buttonPalette(BUTTON_PRESETS[3].tone)).sort()).toEqual(
      Object.keys(BUTTON_PALETTE).sort(),
    )
  })

  it('프리셋마다 밝기 순서가 유지된다', () => {
    // 깨지면 경사가 뒤집혀 눌린 것처럼 보인다.
    for (const p of BUTTON_PRESETS) {
      const pal = buttonPalette(p.tone)
      const l = (role: string) => toHsl(parseHex(pal[roleChar(role)])!).l
      expect(l('bevelLit')).toBeGreaterThan(l('face'))
      expect(l('face')).toBeGreaterThan(l('bevelShade'))
    }
  })

  it('프리셋마다 다른 색이 나온다', () => {
    const seen = new Set(BUTTON_PRESETS.map((p) => JSON.stringify(buttonPalette(p.tone))))
    expect(seen.size).toBe(BUTTON_PRESETS.length)
  })
})

describe('buttonSet', () => {
  it('네 상태가 같은 팔레트에서 나온다', () => {
    const set = buttonSet(64, 32, BUTTON_PRESETS[1].tone)
    expect(set.map((s) => s.state)).toEqual([...BUTTON_STATES])
    // 본체 색은 상태마다 달라도 되지만 크기와 문자는 같아야 한다.
    for (const s of set) {
      expect(s.spec.w).toBe(64)
      expect(Object.keys(s.spec.palette).sort()).toEqual(Object.keys(BUTTON_PALETTE).sort())
    }
  })
})

describe('역할', () => {
  it('다섯 자리가 다 있다', () => {
    expect(BUTTON_ROLE_LIST).toHaveLength(5)
    expect(new Set(BUTTON_ROLE_LIST.map((e) => e.role)).size).toBe(5)
  })

  it('바깥 테두리가 가장 밝고 외곽선이 가장 어둡다', () => {
    // 역할 판별이 뒤집히면 버튼이 음각으로 보인다.
    const l = (role: string) => toHsl(parseHex(BUTTON_PALETTE[roleChar(role)])!).l
    expect(l('halo')).toBeGreaterThan(l('bevelLit'))
    expect(l('outline')).toBeLessThan(l('bevelShade'))
  })

  it('모든 문자에 역할이 붙어 있다', () => {
    for (const ch of Object.keys(BUTTON_PALETTE)) {
      if (ch === '.') continue
      expect(BUTTON_ROLE_OF[ch]).toBeDefined()
    }
  })
})

describe('역할 이름으로 받기', () => {
  it('이름으로 색을 입힌다', () => {
    const set = buttonSetFromRoles(64, 32, [{ char: 'face', hex: '#00ff88' }])
    expect(set[0].spec.palette[roleChar('face')]).toBe('#00ff88')
  })

  it('없는 이름과 잘못된 hex 는 무시한다', () => {
    const set = buttonSetFromRoles(64, 32, [
      { char: 'nope', hex: '#00ff88' },
      { char: 'face', hex: 'green' },
    ])
    expect(set[0].spec.palette[roleChar('face')]).toBe(BUTTON_PALETTE[roleChar('face')])
  })

  it('빠뜨린 자리는 원래 색으로 남는다', () => {
    // 검정으로 만들면 버튼에 구멍이 뚫린 것처럼 보인다.
    const set = buttonSetFromRoles(64, 32, [])
    expect(set[0].spec.palette).toEqual(statePalette(BUTTON_PALETTE, 'normal'))
  })

  it('네 상태가 모두 나온다', () => {
    const set = buttonSetFromRoles(64, 32, [{ char: 'face', hex: '#00ff88' }])
    expect(set.map((s) => s.state)).toEqual([...BUTTON_STATES])
    // 눌림은 경사가 뒤집혀 있어야 한다.
    const normal = set[0].spec.palette
    const pressed = set[2].spec.palette
    expect(pressed[roleChar('bevelLit')]).toBe(normal[roleChar('bevelShade')])
  })
})

describe('세로로도 늘어난다', () => {
  it('패널 크기가 나온다', () => {
    // 같은 한 장이 버튼도 되고 패널도 된다.
    const s = buttonSpec({ w: 160, h: 96, state: 'normal' })
    expect(s.w).toBe(160)
    expect(s.h).toBe(96)
  })

  it('위아래 가장자리가 크기와 무관하게 같다', () => {
    const small = buttonSpec({ w: 64, h: 32, state: 'normal' })
    const tall = buttonSpec({ w: 64, h: 160, state: 'normal' })
    expect(tall.rows.slice(0, BUTTON_BORDER.top)).toEqual(small.rows.slice(0, BUTTON_BORDER.top))
    expect(tall.rows.slice(-BUTTON_BORDER.bottom)).toEqual(small.rows.slice(-BUTTON_BORDER.bottom))
  })
})
