import type { PixelSpec } from '../codec'
import type { ButtonState, ButtonTone } from './button'
import { BUTTON_ROLE_LIST, buttonSet, buttonSetFromRoles } from './button'
import type { DiceSpecItem } from './diceSet'
import { DICE_ROLE_LIST, diceSetSpecsFromRoles, diceSetSpecsToned } from './diceSet'

/**
 * 키트 전체가 쓰는 자리 이름.
 *
 * 주사위와 버튼을 따로 칠하면 색이 안 맞는다. 같은 컨셉으로 두 번 물어보면
 * 모델이 매번 다르게 답하기 때문이다. 한 번에 다 받아야 한 벌이 된다.
 *
 * 이름이 겹치지 않게 앞에 무엇의 자리인지 붙인다. outline 은 주사위에도 버튼에도
 * 있는데, 둘은 굵기도 쓰임도 달라 같은 색이어야 할 이유가 없다.
 */
export const KIT_ROLE_LIST: ReadonlyArray<{ role: string; hex: string; note: string }> = [
  ...DICE_ROLE_LIST.map((e) => ({
    role: `dice.${e.role}`,
    hex: e.hex,
    note: '주사위',
  })),
  ...BUTTON_ROLE_LIST.map((e) => ({
    role: `ui.${e.role}`,
    hex: e.hex,
    note: '버튼과 패널',
  })),
]

const DICE_PREFIX = 'dice.'
const UI_PREFIX = 'ui.'

/** 접두어를 떼어 각 가족에게 넘길 목록으로 나눈다. */
function split(entries: ReadonlyArray<{ char?: string; hex?: string }>) {
  const dice: Array<{ char: string; hex: string }> = []
  const ui: Array<{ char: string; hex: string }> = []
  for (const entry of entries) {
    const role = (entry.char ?? '').trim()
    const hex = (entry.hex ?? '').trim()
    if (role.startsWith(DICE_PREFIX)) dice.push({ char: role.slice(DICE_PREFIX.length), hex })
    else if (role.startsWith(UI_PREFIX)) ui.push({ char: role.slice(UI_PREFIX.length), hex })
  }
  return { dice, ui }
}

export interface KitSizes {
  /** 버튼 크기. */
  button: { w: number; h: number }
  /** 패널 크기. 같은 프레임을 크게 늘린 것이다. */
  panel: { w: number; h: number }
}

export const defaultKitSizes: KitSizes = {
  button: { w: 96, h: 32 },
  panel: { w: 160, h: 96 },
}

export interface Kit {
  /** 등축 여섯 장과 정면 여섯 장. */
  dice: DiceSpecItem[]
  button: Array<{ state: ButtonState; spec: PixelSpec }>
  panel: PixelSpec
}

/** 톤 하나로 키트 전체를 만든다. AI 없이도 색이 맞는다. */
export function kitFromTone(tone: ButtonTone, sizes: KitSizes = defaultKitSizes): Kit {
  const button = buttonSet(sizes.button.w, sizes.button.h, tone)
  return {
    dice: diceSetSpecsToned({
      body: { ...tone },
      // 주사위 눈은 몸통을 따라가면 안 읽힌다. 반대쪽 색으로 둔다.
      pip: { ...tone, hue: (tone.hue + 180) % 360, saturationBoost: Math.max(0.2, tone.saturationBoost) },
    }),
    button,
    panel: buttonSet(sizes.panel.w, sizes.panel.h, tone)[0].spec,
  }
}

/** 모델이 준 배색으로 키트 전체를 만든다. */
export function kitFromRoles(
  entries: ReadonlyArray<{ char?: string; hex?: string }>,
  sizes: KitSizes = defaultKitSizes,
): Kit {
  const parts = split(entries)
  return {
    dice: diceSetSpecsFromRoles(parts.dice),
    button: buttonSetFromRoles(sizes.button.w, sizes.button.h, parts.ui),
    panel: buttonSetFromRoles(sizes.panel.w, sizes.panel.h, parts.ui)[0].spec,
  }
}

/** 모델이 빠뜨린 자리. 하나도 안 왔으면 요청 자체가 실패한 것이다. */
export function missingKitRoles(entries: ReadonlyArray<{ char?: string; hex?: string }>): string[] {
  const given = new Set(entries.map((e) => (e.char ?? '').trim()))
  return KIT_ROLE_LIST.map((e) => e.role).filter((r) => !given.has(r))
}
