import type { PixelSpec } from '../codec'
import { fromSpec } from '../codec'
import { parseHex, toHex, toHsl } from '../color'
import type { PixelDoc } from '../doc'
import { ITEM_FILL_STEPS, ITEM_PALETTE, ITEM_ROLE_OF, ITEM_ROWS, ITEM_SIZE } from './itemFrame'
import type { PaletteEntry } from './variants'
import { dominantHue, variantMappings } from './variants'

/**
 * 아이템 등급.
 *
 * 참고 그림은 전설(금색)이다. 나머지는 색조만 옮겨 만든다 — 형태는 한 픽셀도
 * 바뀌지 않는다.
 */
export const RARITIES = [
  // 일반은 색이 아니라 무채색이다. 배율로 채도를 눌러 흰 회색으로 만든다.
  { id: 'common', name: '일반', en: 'Common', hue: 210, saturation: 0.1, brightness: 0.06 },
  { id: 'uncommon', name: '고급', en: 'Uncommon', hue: 130, saturation: 1, brightness: 0 },
  { id: 'rare', name: '희귀', en: 'Rare', hue: 210, saturation: 1, brightness: 0 },
  { id: 'epic', name: '영웅', en: 'Epic', hue: 280, saturation: 1, brightness: 0 },
  // 참고 그림이 전설이다. 원본 색조를 그대로 두면 원본이 나온다.
  { id: 'legendary', name: '전설', en: 'Legendary', hue: 44, saturation: 1, brightness: 0 },
  { id: 'mythic', name: '신화', en: 'Mythic', hue: 0, saturation: 1, brightness: 0 },
] as const

export type RarityId = (typeof RARITIES)[number]['id']

const charOf = (role: string) => {
  const found = Object.keys(ITEM_ROLE_OF).find((c) => ITEM_ROLE_OF[c] === role)
  if (found === undefined) throw new Error(`${role} 문자를 찾을 수 없습니다`)
  return found
}

export interface RarityTone {
  hue: number
  /** 채도 배율. 1이면 원본만큼 진하다. */
  saturation: number
  brightness: number
}

/** 각 색이 몇 칸을 차지하는지. 대표 색조를 구하는 데 쓴다. */
function entries(): PaletteEntry[] {
  const counts = new Map<string, number>()
  for (const row of ITEM_ROWS) for (const ch of row) counts.set(ch, (counts.get(ch) ?? 0) + 1)

  const out: PaletteEntry[] = []
  for (const [ch, hex] of Object.entries(ITEM_PALETTE)) {
    if (hex === 'transparent') continue
    const color = parseHex(hex)
    if (color) out.push({ color, count: counts.get(ch) ?? 0 })
  }
  return out.sort((a, b) => b.count - a.count)
}

/**
 * 등급 하나의 팔레트.
 *
 * 주사위·버튼과 같은 매핑을 쓴다. 색조를 목표값으로 그냥 몰아넣으면 아홉 색이
 * 한 색이 된다 — 원본에서 각 색이 대표 색조에서 얼마나 벗어나 있었는지를 그대로
 * 옮겨야 테두리의 금색과 주황이 서로 다른 채로 남는다.
 *
 * 속의 일곱 단이 위에서 아래로 밝아지는 것이 이 그림의 입체감이다. 밝기 관계는
 * 매핑이 그대로 지킨다.
 */
/**
 * 테두리 색조를 목표로 잡기 위한 보정.
 *
 * 매핑은 대표 색조를 목표에 맞춘다. 그런데 이 그림의 대표 색조는 넓이가 큰
 * 어두운 갈색 단들에 끌려 테두리보다 20도쯤 낮다. 그대로 두면 "초록으로" 라고
 * 했을 때 테두리가 청록으로 나온다.
 *
 * 테두리가 목표 색조에 정확히 가도록 그 차이만큼 미리 빼 둔다.
 */
function frameOffset(): number {
  const list = entries()
  const base = dominantHue(list)
  if (base === null) return 0
  const frame = parseHex(ITEM_PALETTE[charOf('frameLit')])
  if (!frame) return 0
  return ((((toHsl(frame).h - base) % 360) + 540) % 360) - 180
}

export function rarityPalette(tone: RarityTone): Record<string, string> {
  const mappings = variantMappings(entries(), {
    hue: tone.hue - frameOffset(),
    saturation: tone.saturation,
    saturationBoost: 0,
    contrast: 1,
    brightness: tone.brightness,
    // 검은 속단도 등급 색을 따라가야 한 벌로 보인다.
    keepNeutral: false,
  })
  const byFrom = new Map(mappings.map((m) => [m.from.join(','), toHex(m.to)]))

  const out: Record<string, string> = {}
  for (const [ch, hex] of Object.entries(ITEM_PALETTE)) {
    if (hex === 'transparent') {
      out[ch] = hex
      continue
    }
    const color = parseHex(hex)
    out[ch] = (color && byFrom.get(color.join(','))) ?? hex
  }
  return out
}

export function rarityToneOf(id: RarityId): RarityTone {
  const found = RARITIES.find((r) => r.id === id)
  if (!found) throw new Error(`${id} 는 없는 등급입니다`)
  return { hue: found.hue, saturation: found.saturation, brightness: found.brightness }
}

export function itemSpec(tone: RarityTone): PixelSpec {
  return { w: ITEM_SIZE.w, h: ITEM_SIZE.h, palette: rarityPalette(tone), rows: [...ITEM_ROWS] }
}

export function itemDoc(tone: RarityTone): PixelDoc {
  return fromSpec(itemSpec(tone))
}

export interface RarityItem {
  id: RarityId
  name: string
  en: string
  spec: PixelSpec
}

/** 여섯 등급을 한 벌로. 형태는 모두 같고 색만 다르다. */
export function raritySet(): RarityItem[] {
  return RARITIES.map((r) => ({
    id: r.id,
    name: r.name,
    en: r.en,
    spec: itemSpec({ hue: r.hue, saturation: r.saturation, brightness: r.brightness }),
  }))
}

/** 모델에게 보여 줄 자리 목록. */
export const ITEM_ROLE_LIST: ReadonlyArray<{ role: string; char: string; hex: string }> =
  Object.entries(ITEM_ROLE_OF).map(([char, role]) => ({ role, char, hex: ITEM_PALETTE[char] }))

export { ITEM_FILL_STEPS, ITEM_SIZE }
