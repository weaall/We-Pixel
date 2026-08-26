import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fromSpec, packRows, toSpec, unpackRows } from '../src/core/codec'
import type { PixelDoc } from '../src/core/doc'
import { defaultVariantSetOptions, makeVariants } from '../src/core/generate/variants'
import { decodePng } from '../src/import/pngDecode'
import { toLogicalGrid } from '../src/core/resample'

/**
 * 참고 주사위로 실제 산출을 확인한다.
 *
 * 합성한 그림으로만 시험하면 사람이 그린 그림에서만 나오는 문제를 놓친다.
 * 여기 있는 넷은 실제로 쓰려는 그림이다.
 */
const FIXTURES = ['dice-base', 'dice-black', 'dice-fire', 'dice-wood'] as const

function load(name: string): { raw: PixelDoc; doc: PixelDoc; scale: number } {
  const raw = decodePng(readFileSync(join(__dirname, 'fixtures', `${name}.png`)))
  return { raw, ...toLogicalGrid(raw) }
}

/** 문자 이름을 지운 배치. "어느 칸끼리 같은 색인가" 만 남는다. */
function shapeOf(rows: ReadonlyArray<string>): string {
  const seen = new Map<string, number>()
  return rows
    .map((row) =>
      [...row].map((ch) => {
        if (!seen.has(ch)) seen.set(ch, seen.size)
        return seen.get(ch)
      }).join(','),
    )
    .join('|')
}

describe('참고 주사위', () => {
  it.each(FIXTURES)('%s — 격자를 알아본다', (name) => {
    const { raw, doc, scale } = load(name)
    expect(raw.w).toBe(64)
    // dice-base 만 32x32 를 2배로 저장한 그림이다.
    expect(doc.w).toBe(name === 'dice-base' ? 32 : 64)
    expect(scale).toBe(name === 'dice-base' ? 2 : 1)
  })

  it.each(FIXTURES)('%s — spec 왕복이 무손실이다', (name) => {
    const { doc } = load(name)
    const back = fromSpec(toSpec(doc))
    expect(back.w).toBe(doc.w)
    expect(Array.from(back.data)).toEqual(Array.from(doc.data))
  })

  it.each(FIXTURES)('%s — 접었다 펴도 그대로다', (name) => {
    const spec = toSpec(load(name).doc)
    expect(unpackRows(packRows(spec), spec.w)).toEqual(spec.rows)
  })

  it.each(FIXTURES)('%s — 색이 10종을 넘지 않는다', (name) => {
    // 색이 늘면 팔레트 교체가 흐트러지고 spec 이 길어진다.
    expect(Object.keys(toSpec(load(name).doc).palette).length).toBeLessThanOrEqual(10)
  })

  it.each(FIXTURES)('%s — 색 변형이 배치를 그대로 둔다', (name) => {
    const { doc } = load(name)
    const base = toSpec(doc)
    const want = shapeOf(base.rows)

    for (const v of makeVariants(doc, { ...defaultVariantSetOptions, count: 4, hue: 200 })) {
      const got = toSpec(v.doc)
      expect(shapeOf(got.rows)).toBe(want)
      // 색이 뭉치면 명암 단계가 사라져 그림이 납작해진다.
      expect(Object.keys(got.palette).length).toBe(Object.keys(base.palette).length)
    }
  })

  it('dice-base 의 눈 배치가 그대로 남는다', () => {
    const { doc } = load('dice-base')
    const rows = toSpec(doc).rows
    // 실제로 찍힌 줄. 배치가 틀어지면 이 문자열이 달라진다.
    expect(rows[16]).toBe('.....abccccccccbdeeeeeeeeda.....')
    const variant = makeVariants(doc, { ...defaultVariantSetOptions, count: 1, hue: 200 })[0]
    expect(toSpec(variant.doc).rows[16]).toBe(rows[16])
  })
})
