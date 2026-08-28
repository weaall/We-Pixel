import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fromSpec, toSpec } from '../src/core/codec'
import { parseHex, toHsl } from '../src/core/color'
import {
  ITEM_ROLE_LIST,
  RARITIES,
  itemSpec,
  rarityPalette,
  raritySet,
  rarityToneOf,
} from '../src/core/generate/item'
import { ITEM_FILL_STEPS, ITEM_PALETTE, ITEM_ROWS, ITEM_SIZE } from '../src/core/generate/itemFrame'
import { decodePng } from '../src/import/pngDecode'
import { toLogicalGrid } from '../src/core/resample'

const charOf = (role: string) => ITEM_ROLE_LIST.find((e) => e.role === role)!.char
const hueOf = (hex: string) => toHsl(parseHex(hex)!).h
const lumOf = (hex: string) => toHsl(parseHex(hex)!).l
const satOf = (hex: string) => toHsl(parseHex(hex)!).s

/** 두 색조가 원형으로 얼마나 떨어져 있는지. */
const hueGap = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360) - 180

describe('구운 아이템 프레임', () => {
  it('원본 PNG 를 한 바이트도 안 틀리고 되살린다', () => {
    const want = toLogicalGrid(decodePng(readFileSync(join(__dirname, 'fixtures', 'item.png')))).doc
    const got = fromSpec({
      w: ITEM_SIZE.w,
      h: ITEM_SIZE.h,
      palette: ITEM_PALETTE,
      rows: ITEM_ROWS,
    })
    expect(Array.from(got.data)).toEqual(Array.from(want.data))
  })

  it('테두리 둘과 그라데이션 단이 다 있다', () => {
    expect(ITEM_ROLE_LIST.filter((e) => e.role.startsWith('frame'))).toHaveLength(2)
    expect(ITEM_ROLE_LIST.filter((e) => e.role.startsWith('fill'))).toHaveLength(ITEM_FILL_STEPS)
  })

  it('그라데이션이 위에서 아래로 밝아진다', () => {
    // 이 순서가 이 그림의 입체감이다. 흐트러지면 평평한 사각형이 된다.
    for (let i = 1; i < ITEM_FILL_STEPS; i++) {
      expect(lumOf(ITEM_PALETTE[charOf(`fill${i}`)])).toBeGreaterThan(
        lumOf(ITEM_PALETTE[charOf(`fill${i - 1}`)]),
      )
    }
  })
})

describe('등급', () => {
  it('여섯 등급이 다 있다', () => {
    expect(RARITIES.map((r) => r.en)).toEqual([
      'Common',
      'Uncommon',
      'Rare',
      'Epic',
      'Legendary',
      'Mythic',
    ])
  })

  it('전설은 원본 그대로다', () => {
    // 참고 그림이 전설이다. 여기가 어긋나면 색조 기준이 틀린 것이다.
    expect(rarityPalette(rarityToneOf('legendary'))).toEqual(ITEM_PALETTE)
  })

  it.each([
    ['uncommon', 130],
    ['rare', 210],
    ['epic', 280],
    ['mythic', 0],
  ] as const)('%s — 테두리가 목표 색조로 간다', (id, want) => {
    // 대표 색조는 넓은 갈색 단들에 끌려 테두리보다 낮다. 보정이 없으면 여기서 밀린다.
    const pal = rarityPalette(rarityToneOf(id))
    expect(Math.abs(hueGap(hueOf(pal[charOf('frameLit')]), want))).toBeLessThan(12)
  })

  it('일반은 색이 빠진다', () => {
    const common = satOf(rarityPalette(rarityToneOf('common'))[charOf('frameLit')])
    const rare = satOf(rarityPalette(rarityToneOf('rare'))[charOf('frameLit')])
    expect(common).toBeLessThan(0.2)
    expect(rare).toBeGreaterThan(0.6)
  })

  it('등급마다 밝기 순서가 유지된다', () => {
    for (const r of RARITIES) {
      const pal = rarityPalette(rarityToneOf(r.id))
      for (let i = 1; i < ITEM_FILL_STEPS; i++) {
        expect(lumOf(pal[charOf(`fill${i}`)])).toBeGreaterThan(lumOf(pal[charOf(`fill${i - 1}`)]))
      }
      // 테두리는 속보다 밝아야 칸이 도드라진다.
      expect(lumOf(pal[charOf('frameLit')])).toBeGreaterThan(lumOf(pal[charOf(`fill${ITEM_FILL_STEPS - 1}`)]))
    }
  })

  it('등급마다 다른 색이 나온다', () => {
    const seen = new Set(RARITIES.map((r) => JSON.stringify(rarityPalette(rarityToneOf(r.id)))))
    expect(seen.size).toBe(RARITIES.length)
  })

  it('없는 등급은 거절한다', () => {
    expect(() => rarityToneOf('nope' as never)).toThrow(/없는 등급/)
  })
})

describe('raritySet', () => {
  it('여섯 장이 형태가 같고 색만 다르다', () => {
    const set = raritySet()
    expect(set).toHaveLength(6)
    const rows = set.map((r) => r.spec.rows.join(''))
    expect(new Set(rows).size).toBe(1)
    expect(new Set(set.map((r) => JSON.stringify(r.spec.palette))).size).toBe(6)
  })

  it('문자 배정이 그대로다', () => {
    for (const r of raritySet()) {
      expect(Object.keys(r.spec.palette).sort()).toEqual(Object.keys(ITEM_PALETTE).sort())
    }
  })

  it('한글과 영문 이름을 함께 준다', () => {
    expect(raritySet().map((r) => r.name)).toEqual(['일반', '고급', '희귀', '영웅', '전설', '신화'])
  })

  it('그려도 크기가 같다', () => {
    for (const r of raritySet()) {
      const doc = fromSpec(r.spec)
      expect(doc.w).toBe(ITEM_SIZE.w)
      expect(doc.h).toBe(ITEM_SIZE.h)
      // 투명한 모서리까지 그대로여야 실루엣이 같다.
      expect(toSpec(doc).rows.join('')).toBe(itemSpec(rarityToneOf('legendary')).rows.join(''))
    }
  })
})
