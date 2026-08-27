import { describe, expect, it } from 'vitest'
import type { RGBA } from '../src/core/color'
import { createDoc, getPixel, setPixel } from '../src/core/doc'
import { packAtlas } from '../src/export/atlas'
import { defaultImportOptions, spriteSheetMeta } from '../src/export/unityMeta'

const RED: RGBA = [255, 0, 0, 255]
const BLUE: RGBA = [0, 0, 255, 255]

function solid(w: number, h: number, c: RGBA) {
  const doc = createDoc(w, h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPixel(doc, x, y, c)
  return doc
}

describe('packAtlas', () => {
  it('한 줄로 늘어놓는다', () => {
    const atlas = packAtlas([
      { name: 'a', doc: solid(4, 4, RED) },
      { name: 'b', doc: solid(4, 4, BLUE) },
    ])
    expect(atlas.doc.w).toBe(8)
    expect(atlas.doc.h).toBe(4)
    expect(getPixel(atlas.doc, 0, 0)).toEqual(RED)
    expect(getPixel(atlas.doc, 4, 0)).toEqual(BLUE)
  })

  it('줄 수를 지정할 수 있다', () => {
    const items = [1, 2, 3, 4, 5, 6].map((n) => ({ name: `d${n}`, doc: solid(4, 4, RED) }))
    const atlas = packAtlas(items, { columns: 3 })
    expect(atlas.columns).toBe(3)
    expect(atlas.rows).toBe(2)
    expect(atlas.doc.w).toBe(12)
    expect(atlas.doc.h).toBe(8)
  })

  it('슬라이스가 칸 전체를 덮는다', () => {
    // 그림에 맞춰 좁히면 장마다 피벗이 달라져 굴릴 때 주사위가 튄다.
    const atlas = packAtlas([
      { name: 'big', doc: solid(8, 8, RED) },
      { name: 'small', doc: solid(4, 4, BLUE) },
    ])
    expect(atlas.slices).toEqual([
      { name: 'big', x: 0, y: 0, w: 8, h: 8 },
      { name: 'small', x: 8, y: 0, w: 8, h: 8 },
    ])
  })

  it('작은 장은 칸 가운데에 놓인다', () => {
    const atlas = packAtlas([
      { name: 'big', doc: solid(8, 8, RED) },
      { name: 'small', doc: solid(4, 4, BLUE) },
    ])
    // 8칸 안에 4짜리 -> 좌우 2칸씩 비어야 한다.
    expect(getPixel(atlas.doc, 8, 0)[3]).toBe(0)
    expect(getPixel(atlas.doc, 10, 2)).toEqual(BLUE)
  })

  it('여백을 넣을 수 있다', () => {
    const atlas = packAtlas(
      [{ name: 'a', doc: solid(4, 4, RED) }, { name: 'b', doc: solid(4, 4, BLUE) }],
      { padding: 2 },
    )
    expect(atlas.doc.w).toBe(10)
    expect(getPixel(atlas.doc, 5, 0)[3]).toBe(0)
  })

  it('빈 목록은 거절한다', () => {
    expect(() => packAtlas([])).toThrow(/묶을 그림이 없습니다/)
  })
})

describe('spriteSheetMeta', () => {
  const slices = [
    { name: 'Dice_1', x: 0, y: 0, w: 64, h: 64 },
    { name: 'Dice_2', x: 64, y: 0, w: 64, h: 64 },
  ]
  const meta = spriteSheetMeta(defaultImportOptions, slices, 64, 'a'.repeat(32))

  it('여러 장 모드로 바꾼다', () => {
    // spriteMode 1 이면 유니티가 시트를 한 장으로 읽는다.
    expect(meta).toContain('spriteMode: 2')
    expect(meta).not.toContain('spriteMode: 1')
  })

  it('슬라이스가 다 들어간다', () => {
    expect(meta).toContain('name: Dice_1')
    expect(meta).toContain('name: Dice_2')
    expect(meta).not.toContain('sprites: []')
  })

  it('y를 아래 기준으로 뒤집는다', () => {
    // 유니티의 rect 는 텍스처 아래에서 잰다. 그대로 넣으면 위아래가 뒤집힌다.
    const tall = spriteSheetMeta(
      defaultImportOptions,
      [{ name: 'Top', x: 0, y: 0, w: 64, h: 64 }],
      128,
    )
    expect(tall).toMatch(/y: 64/)
  })

  it('이름이 같으면 id도 같다', () => {
    // 다시 내보냈을 때 id 가 바뀌면 씬에 놓인 참조가 끊긴다.
    const again = spriteSheetMeta(defaultImportOptions, slices, 64, 'b'.repeat(32))
    const ids = (text: string) => text.match(/internalID: \d+/g)
    expect(ids(again)).toEqual(ids(meta))
  })

  it('스프라이트마다 0이 아닌 서로 다른 id를 준다', () => {
    // 0 이면 유니티가 임포트할 때 새로 매기고, 씬에 놓인 참조가 끊긴다.
    // 시트 자체의 internalID 는 0 이 맞으므로 sprites 안쪽만 본다.
    const inSprites = meta.slice(meta.indexOf('    sprites:'))
    const ids = [...inSprites.matchAll(/      internalID: (\d+)/g)].map((m) => Number(m[1]))
    expect(ids).toHaveLength(2)
    for (const id of ids) expect(id).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(2)
  })

  it('이름 표에 다 들어간다', () => {
    expect(meta).toContain('second: Dice_1')
    expect(meta).toContain('second: Dice_2')
    expect(meta).not.toContain('internalIDToNameTable: []')
  })
})
