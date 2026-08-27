import { parseHex, toHex } from '../color'
import type { PixelSpec } from '../codec'
import { fromSpec, unpackRows } from '../codec'
import type { PixelDoc } from '../doc'
import type { DiceRole } from './diceFrames'
import {
  DICE_FRAMES,
  DICE_FRAME_SIZE,
  DICE_PALETTE,
  DICE_ROLE_OF,
  FACE_FRAMES,
} from './diceFrames'
import type { PaletteEntry, VariantOptions } from './variants'
import { variantMappings } from './variants'

export const DICE_TOPS = [1, 2, 3, 4, 5, 6] as const
export type DiceTop = (typeof DICE_TOPS)[number]

/**
 * 어느 가족인지.
 *
 * iso 는 세 면이 보이는 등축, face 는 한 면만 보이는 정면이다. 한 번에 열두
 * 장이 나오고 팔레트를 함께 쓴다.
 */
export type DiceKind = 'iso' | 'face'
export const DICE_KINDS: ReadonlyArray<DiceKind> = ['iso', 'face']

const framesOf = (kind: DiceKind) => (kind === 'iso' ? DICE_FRAMES : FACE_FRAMES)

export interface Dice {
  kind: DiceKind
  /** 윗면 눈. 1~6. */
  top: DiceTop
  /** 보이는 세 면: 위, 왼쪽, 오른쪽. */
  pips: [number, number, number]
  doc: PixelDoc
}

/** 프레임을 spec 으로. 팔레트를 갈아끼울 때는 palette 만 바꿔 넣는다. */
export function diceSpec(
  top: DiceTop,
  palette: Record<string, string> = DICE_PALETTE,
  kind: DiceKind = 'iso',
): PixelSpec {
  const frame = framesOf(kind)[top]
  if (!frame) throw new Error(`${kind} ${top} 번 프레임이 없습니다`)
  return {
    w: DICE_FRAME_SIZE.w,
    h: DICE_FRAME_SIZE.h,
    palette,
    rows: unpackRows(frame.rows, DICE_FRAME_SIZE.w),
  }
}

export function diceDoc(
  top: DiceTop,
  palette?: Record<string, string>,
  kind: DiceKind = 'iso',
): PixelDoc {
  return fromSpec(diceSpec(top, palette, kind))
}

/** 열두 장을 한 팔레트로. 등축 여섯 장 뒤에 정면 여섯 장이 온다. */
function twelve(palette: Record<string, string>): DiceSpecItem[] {
  const out: DiceSpecItem[] = []
  for (const kind of DICE_KINDS) {
    for (const top of DICE_TOPS) {
      out.push({ kind, top, pips: framesOf(kind)[top].pips, spec: diceSpec(top, palette, kind) })
    }
  }
  return out
}

export interface DiceSpecItem {
  kind: DiceKind
  top: DiceTop
  pips: [number, number, number]
  spec: PixelSpec
}

/**
 * 여섯 장이 함께 쓰는 팔레트를 사용 빈도와 함께 돌려준다.
 *
 * 대표 색조를 구할 때 빈도가 필요하다. 한 장만 세면 그 장의 눈 개수에 따라
 * 붉은 계열의 비중이 달라져 세트마다 색조가 흔들린다.
 */
export function dicePalette(): PaletteEntry[] {
  const counts = new Map<string, number>()
  for (const kind of DICE_KINDS) {
    for (const top of DICE_TOPS) {
      for (const row of unpackRows(framesOf(kind)[top].rows, DICE_FRAME_SIZE.w)) {
        for (const ch of row) counts.set(ch, (counts.get(ch) ?? 0) + 1)
      }
    }
  }

  const out: PaletteEntry[] = []
  for (const [ch, hex] of Object.entries(DICE_PALETTE)) {
    if (hex === 'transparent') continue
    const color = parseHex(hex)
    if (color) out.push({ color, count: counts.get(ch) ?? 0 })
  }
  out.sort((a, b) => b.count - a.count)
  return out
}

/**
 * 옵션대로 옮긴 팔레트.
 *
 * 매핑을 한 번만 만들어 여섯 장에 그대로 쓴다. 장마다 다시 계산하면 같은
 * 회색이 장마다 다른 색이 되어 세트로 보이지 않는다 — 세트의 요건은 여섯 개가
 * 같은 색 패턴을 쓰는 것이다.
 *
 * 문자 배정은 원본 그대로 둔다. 결과를 toSpec 으로 다시 매기면 장마다 색의
 * 등장 순서가 달라 같은 회색이 다른 문자가 된다. 세트인지 눈으로 확인할 수도,
 * 배색 하나를 여섯 장에 다시 입힐 수도 없어진다.
 */
export function diceSetPalette(o: VariantOptions): Record<string, string> {
  const entries = dicePalette()
  const mappings = variantMappings(entries, o)
  const byFrom = new Map(mappings.map((m) => [m.from.join(','), toHex(m.to)]))

  const out: Record<string, string> = {}
  for (const [char, hex] of Object.entries(DICE_PALETTE)) {
    if (hex === 'transparent') {
      out[char] = hex
      continue
    }
    const color = parseHex(hex)
    out[char] = (color && byFrom.get(color.join(','))) ?? hex
  }
  return out
}

/** 세트 하나를 spec 으로. 여섯 장이 같은 문자와 같은 팔레트를 쓴다. */
export function diceSetSpecs(o: VariantOptions): DiceSpecItem[] {
  return twelve(diceSetPalette(o))
}

export function makeDiceSet(o: VariantOptions): Dice[] {
  return diceSetSpecs(o).map((it) => ({ ...it, doc: fromSpec(it.spec) }))
}

/**
 * 모델이 정해 준 팔레트로 세트를 만든다.
 *
 * 못 알아본 문자는 원래 색으로 둔다. 빠뜨린 색을 투명이나 검정으로 만들면
 * 주사위에 구멍이 뚫린다.
 */
export function diceSetPaletteFrom(
  entries: ReadonlyArray<{ char?: string; hex?: string }>,
): Record<string, string> {
  const palette: Record<string, string> = { ...DICE_PALETTE }
  for (const entry of entries) {
    const char = (entry.char ?? '').trim()
    const hex = (entry.hex ?? '').trim()
    if (char.length !== 1 || palette[char] === undefined || palette[char] === 'transparent') continue
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) continue
    palette[char] = hex
  }
  return palette
}

export function diceSetSpecsFrom(
  entries: ReadonlyArray<{ char?: string; hex?: string }>,
): DiceSpecItem[] {
  return twelve(diceSetPaletteFrom(entries))
}

export function diceSetFromPalette(entries: ReadonlyArray<{ char?: string; hex?: string }>): Dice[] {
  return diceSetSpecsFrom(entries).map((it) => ({ ...it, doc: fromSpec(it.spec) }))
}

/** 모델에게 보여 줄 목록. 많이 쓰인 색부터. */
export function dicePaletteList(): Array<{ char: string; hex: string }> {
  const counts = new Map<string, number>()
  for (const top of DICE_TOPS) {
    for (const row of unpackRows(DICE_FRAMES[top].rows, DICE_FRAME_SIZE.w)) {
      for (const ch of row) counts.set(ch, (counts.get(ch) ?? 0) + 1)
    }
  }
  return Object.entries(DICE_PALETTE)
    .filter(([, hex]) => hex !== 'transparent')
    .map(([char, hex]) => ({ char, hex, n: counts.get(char) ?? 0 }))
    .sort((a, b) => b.n - a.n)
    .map(({ char, hex }) => ({ char, hex }))
}

/** 세트가 실제 주사위인지. 마주보는 면의 합은 7이다. */
export function isRealDice(pips: ReadonlyArray<number>): boolean {
  if (pips.length !== 3) return false
  if (pips.some((v) => !Number.isInteger(v) || v < 1 || v > 6)) return false
  return new Set(pips.map((v) => Math.min(v, 7 - v))).size === 3
}

// ---- 역할별 톤 ----------------------------------------------------------

/** 눈은 몸통과 따로 움직여야 한다. "돌 몸통에 붉은 눈" 이 안 되면 반쪽이다. */
export const PIP_ROLES: ReadonlySet<DiceRole> = new Set<DiceRole>([
  'pipEdge',
  'pipShade',
  'pipLit',
])

export type DiceTone = Pick<
  VariantOptions,
  'hue' | 'saturation' | 'saturationBoost' | 'contrast' | 'brightness'
>

export const defaultDiceTone: DiceTone = {
  hue: 30,
  saturation: 1,
  saturationBoost: 0,
  contrast: 1,
  brightness: 0,
}

export interface DiceToneOptions {
  body: DiceTone
  pip: DiceTone
}

function entriesFor(want: (role: DiceRole) => boolean): PaletteEntry[] {
  return dicePalette().filter((e) => {
    const hex = toHex(e.color)
    const char = Object.keys(DICE_PALETTE).find((c) => DICE_PALETTE[c] === hex)
    const role = char ? DICE_ROLE_OF[char] : undefined
    return role !== undefined && want(role)
  })
}

/**
 * 몸통과 눈을 따로 옮긴 팔레트.
 *
 * 두 무리를 따로 계산해야 한다. 함께 넣으면 대표 색조가 하나로 잡혀 붉은 눈이
 * 몸통을 따라 파랗게 끌려간다.
 */
export function diceTonedPalette(o: DiceToneOptions): Record<string, string> {
  const isPip = (role: DiceRole) => PIP_ROLES.has(role)
  const bodyMap = new Map(
    variantMappings(entriesFor((r) => !isPip(r)), { ...o.body, keepNeutral: false }).map((m) => [
      m.from.join(','),
      toHex(m.to),
    ]),
  )
  const pipMap = new Map(
    variantMappings(entriesFor(isPip), { ...o.pip, keepNeutral: false }).map((m) => [
      m.from.join(','),
      toHex(m.to),
    ]),
  )

  const out: Record<string, string> = {}
  for (const [char, hex] of Object.entries(DICE_PALETTE)) {
    if (hex === 'transparent') {
      out[char] = hex
      continue
    }
    const color = parseHex(hex)
    const key = color ? color.join(',') : ''
    out[char] = bodyMap.get(key) ?? pipMap.get(key) ?? hex
  }
  return out
}

/** 톤으로 세트를 만든다. 여섯 장이 같은 팔레트를 쓴다. */
export function diceSetSpecsToned(o: DiceToneOptions): DiceSpecItem[] {
  return twelve(diceTonedPalette(o))
}

export function makeDiceSetToned(o: DiceToneOptions): Dice[] {
  return diceSetSpecsToned(o).map((it) => ({ ...it, doc: fromSpec(it.spec) }))
}

/**
 * 자주 쓰는 조합.
 *
 * 몸통은 무채색이라 배율만으로는 색이 붙지 않는다 — 0에 무엇을 곱해도 0이다.
 * 그래서 채도를 더한다.
 */
export const DICE_PRESETS: ReadonlyArray<{ name: string; tone: DiceToneOptions }> = [
  {
    name: '돌',
    tone: {
      body: { ...defaultDiceTone, hue: 210, saturationBoost: 0.04 },
      pip: { ...defaultDiceTone, hue: 350 },
    },
  },
  {
    name: '황금',
    tone: {
      body: { ...defaultDiceTone, hue: 44, saturationBoost: 0.62, brightness: 0.06 },
      pip: { ...defaultDiceTone, hue: 22, saturation: 0.7, brightness: -0.06 },
    },
  },
  {
    name: '얼음',
    tone: {
      body: { ...defaultDiceTone, hue: 196, saturationBoost: 0.42, brightness: 0.1 },
      pip: { ...defaultDiceTone, hue: 210, saturation: 0.55, brightness: 0.08 },
    },
  },
  {
    name: '독',
    tone: {
      body: { ...defaultDiceTone, hue: 132, saturationBoost: 0.34 },
      pip: { ...defaultDiceTone, hue: 88, saturation: 0.8, brightness: 0.04 },
    },
  },
  {
    name: '뼈',
    tone: {
      body: { ...defaultDiceTone, hue: 44, saturationBoost: 0.16, brightness: 0.12 },
      pip: { ...defaultDiceTone, hue: 20, saturation: 0.5, brightness: -0.08 },
    },
  },
  {
    name: '불꽃',
    tone: {
      body: { ...defaultDiceTone, hue: 18, saturationBoost: 0.5 },
      pip: { ...defaultDiceTone, hue: 48, saturation: 0.9, brightness: 0.16 },
    },
  },
]

/** 역할 -> 지금 색. 모델에게 보여 줄 목록이다. */
export const DICE_ROLE_LIST: ReadonlyArray<{ role: DiceRole; char: string; hex: string }> =
  Object.entries(DICE_ROLE_OF).map(([char, role]) => ({ role, char, hex: DICE_PALETTE[char] }))

/**
 * 역할 이름으로 받은 배색을 팔레트로 바꾼다.
 *
 * 모델에게 a, b, c 를 주면 무엇을 칠하는지 모른 채 고른다. 역할 이름을 주면
 * "눈의 밝은 쪽" 이라는 것을 알고 고른다 — 같은 모델이 훨씬 잘한다.
 */
export function diceSetPaletteFromRoles(
  entries: ReadonlyArray<{ char?: string; hex?: string }>,
): Record<string, string> {
  const byRole = new Map<string, string>()
  for (const entry of entries) {
    const role = (entry.char ?? '').trim()
    const hex = (entry.hex ?? '').trim()
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) continue
    byRole.set(role, hex)
  }

  const palette: Record<string, string> = { ...DICE_PALETTE }
  for (const { role, char } of DICE_ROLE_LIST) {
    const hex = byRole.get(role)
    // 못 알아본 자리는 원래 색으로 둔다. 빠뜨린 색을 검정으로 만들면 구멍이 뚫린다.
    if (hex) palette[char] = hex
  }
  return palette
}

export function diceSetSpecsFromRoles(
  entries: ReadonlyArray<{ char?: string; hex?: string }>,
): DiceSpecItem[] {
  return twelve(diceSetPaletteFromRoles(entries))
}
