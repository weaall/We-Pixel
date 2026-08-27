import { parseHex, toHex } from '../color'
import type { PixelSpec } from '../codec'
import { fromSpec, unpackRows } from '../codec'
import type { PixelDoc } from '../doc'
import { DICE_FRAMES, DICE_FRAME_SIZE, DICE_PALETTE } from './diceFrames'
import type { PaletteEntry, VariantOptions } from './variants'
import { variantMappings } from './variants'

export const DICE_TOPS = [1, 2, 3, 4, 5, 6] as const
export type DiceTop = (typeof DICE_TOPS)[number]

export interface Dice {
  /** 윗면 눈. 1~6. */
  top: DiceTop
  /** 보이는 세 면: 위, 왼쪽, 오른쪽. */
  pips: [number, number, number]
  doc: PixelDoc
}

/** 프레임을 spec 으로. 팔레트를 갈아끼울 때는 palette 만 바꿔 넣는다. */
export function diceSpec(top: DiceTop, palette: Record<string, string> = DICE_PALETTE): PixelSpec {
  const frame = DICE_FRAMES[top]
  if (!frame) throw new Error(`${top} 번 주사위 프레임이 없습니다`)
  return {
    w: DICE_FRAME_SIZE.w,
    h: DICE_FRAME_SIZE.h,
    palette,
    rows: unpackRows(frame.rows, DICE_FRAME_SIZE.w),
  }
}

export function diceDoc(top: DiceTop, palette?: Record<string, string>): PixelDoc {
  return fromSpec(diceSpec(top, palette))
}

/**
 * 여섯 장이 함께 쓰는 팔레트를 사용 빈도와 함께 돌려준다.
 *
 * 대표 색조를 구할 때 빈도가 필요하다. 한 장만 세면 그 장의 눈 개수에 따라
 * 붉은 계열의 비중이 달라져 세트마다 색조가 흔들린다.
 */
export function dicePalette(): PaletteEntry[] {
  const counts = new Map<string, number>()
  for (const top of DICE_TOPS) {
    for (const row of unpackRows(DICE_FRAMES[top].rows, DICE_FRAME_SIZE.w)) {
      for (const ch of row) counts.set(ch, (counts.get(ch) ?? 0) + 1)
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
export function diceSetSpecs(o: VariantOptions): Array<{
  top: DiceTop
  pips: [number, number, number]
  spec: PixelSpec
}> {
  const palette = diceSetPalette(o)
  return DICE_TOPS.map((top) => ({
    top,
    pips: DICE_FRAMES[top].pips,
    spec: diceSpec(top, palette),
  }))
}

export function makeDiceSet(o: VariantOptions): Dice[] {
  return diceSetSpecs(o).map(({ top, pips, spec }) => ({ top, pips, doc: fromSpec(spec) }))
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
): Array<{ top: DiceTop; pips: [number, number, number]; spec: PixelSpec }> {
  const palette = diceSetPaletteFrom(entries)
  return DICE_TOPS.map((top) => ({
    top,
    pips: DICE_FRAMES[top].pips,
    spec: diceSpec(top, palette),
  }))
}

export function diceSetFromPalette(entries: ReadonlyArray<{ char?: string; hex?: string }>): Dice[] {
  return diceSetSpecsFrom(entries).map(({ top, pips, spec }) => ({ top, pips, doc: fromSpec(spec) }))
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
