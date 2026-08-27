import { fromSpec } from '../codec'
import type { PixelSpec } from '../codec'
import { parseHex, toHex } from '../color'
import type { PixelDoc } from '../doc'
import type { ButtonRole } from './buttonFrame'
import { BUTTON_BORDER, BUTTON_PALETTE, BUTTON_ROLE_OF, BUTTON_ROWS, BUTTON_SIZE } from './buttonFrame'
import type { PaletteEntry, VariantOptions } from './variants'
import { variantMappings } from './variants'

export const BUTTON_STATES = ['normal', 'hover', 'pressed', 'disabled'] as const
export type ButtonState = (typeof BUTTON_STATES)[number]

export const MIN_BUTTON_W = BUTTON_BORDER.left + BUTTON_BORDER.right + 1
export const MIN_BUTTON_H = BUTTON_BORDER.top + BUTTON_BORDER.bottom + 1

/**
 * 9-슬라이스로 늘린 행.
 *
 * 가장자리는 그대로 두고 가운데만 반복한다. 통째로 늘리면 둥근 모서리가 늘어져
 * 뭉개지고, 경사 두께가 크기마다 달라진다.
 */
export function stretchRows(w: number, h: number): string[] {
  const width = Math.max(MIN_BUTTON_W, Math.floor(w))
  const height = Math.max(MIN_BUTTON_H, Math.floor(h))
  const { left, right, top, bottom } = BUTTON_BORDER

  const fillW = width - left - right
  const fillH = height - top - bottom
  const midRow = BUTTON_ROWS[top]

  const row = (src: string) =>
    src.slice(0, left) + src[left].repeat(fillW) + src.slice(BUTTON_SIZE.w - right)

  const out: string[] = []
  for (let y = 0; y < top; y++) out.push(row(BUTTON_ROWS[y]))
  for (let y = 0; y < fillH; y++) out.push(row(midRow))
  for (let y = 0; y < bottom; y++) out.push(row(BUTTON_ROWS[BUTTON_SIZE.h - bottom + y]))
  return out
}

function charOf(role: ButtonRole): string {
  const found = Object.keys(BUTTON_ROLE_OF).find((c) => BUTTON_ROLE_OF[c] === role)
  if (found === undefined) throw new Error(`${role} 문자를 찾을 수 없습니다`)
  return found
}

/**
 * 눌린 상태는 경사를 뒤집는다.
 *
 * 형태를 다시 그리지 않는다. 빛을 받던 쪽이 그늘이 되고 그늘이 빛을 받으면
 * 같은 그림이 파인 것처럼 보인다 — 픽셀 아트 버튼이 오래 쓰는 방법이다.
 */
function pressPalette(palette: Record<string, string>): Record<string, string> {
  const lit = charOf('bevelLit')
  const shade = charOf('bevelShade')
  return { ...palette, [lit]: palette[shade], [shade]: palette[lit] }
}

export interface ButtonTone {
  hue: number
  saturation: number
  saturationBoost: number
  contrast: number
  brightness: number
}

export const defaultButtonTone: ButtonTone = {
  hue: 213,
  saturation: 1,
  saturationBoost: 0,
  contrast: 1,
  brightness: 0,
}

function entries(): PaletteEntry[] {
  const counts = new Map<string, number>()
  for (const row of BUTTON_ROWS) for (const ch of row) counts.set(ch, (counts.get(ch) ?? 0) + 1)

  const out: PaletteEntry[] = []
  for (const [ch, hex] of Object.entries(BUTTON_PALETTE)) {
    if (hex === 'transparent') continue
    const color = parseHex(hex)
    if (color) out.push({ color, count: counts.get(ch) ?? 0 })
  }
  return out.sort((a, b) => b.count - a.count)
}

/** 톤을 옮긴 팔레트. 문자 배정은 그대로 둔다. */
export function buttonPalette(tone: ButtonTone): Record<string, string> {
  const mappings = variantMappings(entries(), {
    ...(tone as VariantOptions),
    // 흰 테두리와 검은 외곽선은 색조가 없어 배율만으로는 물들지 않는다.
    keepNeutral: false,
  })
  const byFrom = new Map(mappings.map((m) => [m.from.join(','), toHex(m.to)]))

  const out: Record<string, string> = {}
  for (const [ch, hex] of Object.entries(BUTTON_PALETTE)) {
    if (hex === 'transparent') {
      out[ch] = hex
      continue
    }
    const color = parseHex(hex)
    out[ch] = (color && byFrom.get(color.join(','))) ?? hex
  }
  return out
}

/**
 * 상태에 맞게 팔레트를 손본다.
 *
 * 형태는 어느 상태에서도 같다. 크기가 달라지면 눌렀을 때 옆 요소가 밀린다.
 */
export function statePalette(
  palette: Record<string, string>,
  state: ButtonState,
): Record<string, string> {
  if (state === 'normal') return { ...palette }
  if (state === 'pressed') return pressPalette(palette)

  const shift = (hex: string, dl: number, ds: number): string => {
    const color = parseHex(hex)
    if (!color) return hex
    const [r, g, b, a] = color
    const mix = (v: number) => Math.round(v + (dl > 0 ? (255 - v) * dl : v * dl))
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const gray = (v: number) => Math.round(v + (lum - v) * ds)
    return toHex([mix(gray(r)), mix(gray(g)), mix(gray(b)), a])
  }

  const out: Record<string, string> = {}
  for (const [ch, hex] of Object.entries(palette)) {
    if (hex === 'transparent') {
      out[ch] = hex
      continue
    }
    // 외곽선은 건드리지 않는다. 검정이 회색으로 뜨면 픽셀 아트가 흐릿해 보인다.
    if (BUTTON_ROLE_OF[ch] === 'outline') {
      out[ch] = hex
      continue
    }
    // 위로 뜬 느낌은 밝게, 못 쓰는 상태는 색을 빼서.
    out[ch] = state === 'hover' ? shift(hex, 0.16, 0) : shift(hex, -0.1, 0.75)
  }
  return out
}

export interface ButtonOptions {
  w: number
  h: number
  state: ButtonState
  palette?: Record<string, string>
}

export function buttonSpec(o: ButtonOptions): PixelSpec {
  const rows = stretchRows(o.w, o.h)
  return {
    w: rows[0].length,
    h: rows.length,
    palette: statePalette(o.palette ?? BUTTON_PALETTE, o.state),
    rows,
  }
}

export function renderButton(o: ButtonOptions): PixelDoc {
  return fromSpec(buttonSpec(o))
}

export interface ButtonSetItem {
  state: ButtonState
  spec: PixelSpec
}

/** 네 상태를 한 벌로. 크기와 문자 배정이 모두 같다. */
export function buttonSet(w: number, h: number, tone: ButtonTone): ButtonSetItem[] {
  const palette = buttonPalette(tone)
  return BUTTON_STATES.map((state) => ({ state, spec: buttonSpec({ w, h, state, palette }) }))
}

export const BUTTON_PRESETS: ReadonlyArray<{ name: string; tone: ButtonTone }> = [
  { name: '기본', tone: { ...defaultButtonTone } },
  { name: '풀', tone: { ...defaultButtonTone, hue: 138, saturationBoost: 0.1 } },
  { name: '경고', tone: { ...defaultButtonTone, hue: 8, saturationBoost: 0.16 } },
  { name: '황금', tone: { ...defaultButtonTone, hue: 44, saturationBoost: 0.3, brightness: 0.04 } },
  { name: '보라', tone: { ...defaultButtonTone, hue: 282, saturationBoost: 0.12 } },
  { name: '재', tone: { ...defaultButtonTone, hue: 213, saturation: 0.15 } },
]

/** 역할 -> 지금 색. 모델에게 보여 줄 목록이다. */
export const BUTTON_ROLE_LIST: ReadonlyArray<{ role: ButtonRole; char: string; hex: string }> =
  Object.entries(BUTTON_ROLE_OF).map(([char, role]) => ({ role, char, hex: BUTTON_PALETTE[char] }))

/**
 * 역할 이름으로 받은 배색을 팔레트로 바꾼다.
 *
 * 못 알아본 자리는 원래 색으로 둔다. 빠뜨린 색을 검정으로 만들면 버튼에 구멍이
 * 뚫린 것처럼 보인다.
 */
export function buttonPaletteFromRoles(
  entries: ReadonlyArray<{ char?: string; hex?: string }>,
): Record<string, string> {
  const byRole = new Map<string, string>()
  for (const entry of entries) {
    const role = (entry.char ?? '').trim()
    const hex = (entry.hex ?? '').trim()
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) continue
    byRole.set(role, hex)
  }

  const palette: Record<string, string> = { ...BUTTON_PALETTE }
  for (const { role, char } of BUTTON_ROLE_LIST) {
    const hex = byRole.get(role)
    if (hex) palette[char] = hex
  }
  return palette
}

export function buttonSetFromRoles(
  w: number,
  h: number,
  entries: ReadonlyArray<{ char?: string; hex?: string }>,
): ButtonSetItem[] {
  const palette = buttonPaletteFromRoles(entries)
  return BUTTON_STATES.map((state) => ({ state, spec: buttonSpec({ w, h, state, palette }) }))
}
