import { describe, expect, it } from 'vitest'
import {
  canPackRows,
  fromSpec,
  packRow,
  packRows,
  toSpec,
  unpackRow,
  unpackRows,
} from '../src/core/codec'
import { createDoc, setPixel } from '../src/core/doc'

describe('packRow / unpackRow', () => {
  it('긴 반복만 접는다', () => {
    expect(packRow('..........aab')).toBe('.~10aab')
    // 3개는 접어도 3자라 그대로 둔다.
    expect(packRow('aaabbb')).toBe('aaabbb')
    expect(packRow('aaaa')).toBe('a~4')
  })

  it('접었다 펴면 원래대로 돌아온다', () => {
    const cases: ReadonlyArray<[string, number]> = [
      ['.~10aab', 13],
      ['abcabc', 6],
      ['x~64', 64],
      // 실제 주사위에서 나온 행이다.
      ['.~5abc~8bde~8da.~5', 32],
    ]
    for (const [packed, w] of cases) {
      expect(packRow(unpackRow(packed, w))).toBe(packed)
    }
  })

  it('빈 행도 다룬다', () => {
    expect(packRow('')).toBe('')
    expect(unpackRow('', 0)).toBe('')
  })

  it('길이가 w와 다르면 알려준다', () => {
    // 조용히 짧은 행을 받으면 그림이 한 칸씩 밀린 채로 저장된다.
    expect(() => unpackRow('a~3', 8)).toThrow(/길이가 3인데 w는 8/)
    expect(() => unpackRow('a~99', 8)).toThrow(/넘습니다/)
  })

  it('망가진 표기를 거른다', () => {
    expect(() => unpackRow('a~', 4)).toThrow(/개수가 없습니다/)
    expect(() => unpackRow('~4', 4)).toThrow(/앞에 문자가 없습니다/)
  })

  it('개수가 커도 메모리를 먹지 않는다', () => {
    // w 를 넘는 순간 멈춘다. 먼저 만들고 나서 재면 이미 늦다.
    expect(() => unpackRow('a~999999999', 64)).toThrow(/넘습니다/)
  })
})

describe('packRows / unpackRows', () => {
  const doc = createDoc(8, 3)
  for (let x = 0; x < 8; x++) setPixel(doc, x, 1, [255, 0, 0, 255])
  const spec = toSpec(doc)

  it('문서를 왕복해도 같은 그림이다', () => {
    const packed = packRows(spec)
    const restored = fromSpec({ ...spec, rows: unpackRows(packed, spec.w) })
    expect(Array.from(restored.data)).toEqual(Array.from(doc.data))
  })

  it('실제로 짧아진다', () => {
    expect(packRows(spec).join('').length).toBeLessThan(spec.rows.join('').length)
  })

  it('몇 번째 행이 틀렸는지 알려준다', () => {
    expect(() => unpackRows(['a~8', 'a~3'], 8)).toThrow(/^1번 행:/)
  })

  it('팔레트가 숫자를 쓰면 접지 않는다', () => {
    // 숫자를 개수와 구분할 수 없다. 조용히 틀리느니 거절한다.
    expect(canPackRows({ a: '#fff' })).toBe(true)
    expect(canPackRows({ '3': '#fff' })).toBe(false)
    expect(() => packRows({ w: 1, h: 1, palette: { '3': '#fff' }, rows: ['3'] })).toThrow(/숫자/)
  })
})
