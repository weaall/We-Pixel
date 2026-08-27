import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fromSpec, unpackRows } from '../src/core/codec'
import type { PixelDoc } from '../src/core/doc'
import { DICE_FRAMES, DICE_FRAME_SIZE, DICE_PALETTE } from '../src/core/generate/diceFrames'
import { defaultVariantSetOptions, makeVariants, paletteOf } from '../src/core/generate/variants'
import { decodePng } from '../src/import/pngDecode'
import { toLogicalGrid } from '../src/core/resample'

const TOPS = [1, 2, 3, 4, 5, 6] as const

function frameDoc(top: number): PixelDoc {
  const frame = DICE_FRAMES[top]
  return fromSpec({
    w: DICE_FRAME_SIZE.w,
    h: DICE_FRAME_SIZE.h,
    palette: DICE_PALETTE,
    rows: unpackRows(frame.rows, DICE_FRAME_SIZE.w),
  })
}

function sourceDoc(top: number): PixelDoc {
  return toLogicalGrid(decodePng(readFileSync(join(__dirname, 'fixtures', `base-${top}.png`)))).doc
}

describe('기본 주사위 프레임', () => {
  it('여섯 장이 다 있다', () => {
    expect(Object.keys(DICE_FRAMES).map(Number).sort()).toEqual([1, 2, 3, 4, 5, 6])
  })

  it.each(TOPS)('%d — 원본 PNG 를 한 바이트도 안 틀리고 되살린다', (top) => {
    expect(Array.from(frameDoc(top).data)).toEqual(Array.from(sourceDoc(top).data))
  })

  it.each(TOPS)('%d — 윗면 눈이 파일 이름과 맞는다', (top) => {
    expect(DICE_FRAMES[top].pips[0]).toBe(top)
  })

  it.each(TOPS)('%d — 마주보는 면의 합이 7이다', (top) => {
    // 세 면이 (1,6) (2,5) (3,4) 에서 하나씩이어야 실제 주사위다.
    const pips = DICE_FRAMES[top].pips
    expect(new Set(pips.map((v) => Math.min(v, 7 - v))).size).toBe(3)
    for (const v of pips) expect(v).toBeGreaterThanOrEqual(1)
    for (const v of pips) expect(v).toBeLessThanOrEqual(6)
  })

  it('여섯 장이 팔레트를 함께 쓴다', () => {
    // 장마다 따로 매기면 배색 하나를 여섯 장에 똑같이 입힐 수 없다.
    for (const top of TOPS) {
      const used = new Set(unpackRows(DICE_FRAMES[top].rows, DICE_FRAME_SIZE.w).join(''))
      for (const ch of used) expect(DICE_PALETTE[ch]).toBeDefined()
    }
  })

  it('몸통은 여섯 장이 공유한다', () => {
    // 눈만 달라야 한다. 몸통이 흔들리면 세트로 보이지 않는다.
    const docs = TOPS.map(frameDoc)
    let same = 0
    const total = DICE_FRAME_SIZE.w * DICE_FRAME_SIZE.h
    for (let i = 0; i < total; i++) {
      const at = i * 4
      const first = docs[0].data.slice(at, at + 4).join()
      if (docs.every((d) => d.data.slice(at, at + 4).join() === first)) same++
    }
    expect(same / total).toBeGreaterThan(0.9)
  })

  it.each(TOPS)('%d — 색 변형이 눈 배치를 건드리지 않는다', (top) => {
    const doc = frameDoc(top)
    const before = paletteOf(doc).length
    for (const v of makeVariants(doc, { ...defaultVariantSetOptions, count: 3, hue: 200 })) {
      expect(paletteOf(v.doc).length).toBe(before)
      // 알파는 실루엣이다. 한 바이트도 바뀌면 안 된다.
      for (let i = 3; i < doc.data.length; i += 4) expect(v.doc.data[i]).toBe(doc.data[i])
    }
  })
})
