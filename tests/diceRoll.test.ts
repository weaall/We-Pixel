import { describe, expect, it } from 'vitest'
import { fromSpec } from '../src/core/codec'
import type { PixelDoc } from '../src/core/doc'
import {
  bounceAt,
  defaultRollOptions,
  frameHeadroom,
  makeRoll,
  rollOrder,
  rollSheetItems,
} from '../src/core/generate/diceRoll'
import { diceSpec } from '../src/core/generate/diceSet'

function opaque(doc: PixelDoc): number {
  let n = 0
  for (let i = 3; i < doc.data.length; i += 4) if (doc.data[i] !== 0) n++
  return n
}

describe('frameHeadroom', () => {
  it('실루엣 위아래 여백을 잰다', () => {
    const room = frameHeadroom()
    expect(room.top).toBeGreaterThan(0)
    expect(room.bottom).toBeGreaterThan(0)
  })
})

describe('rollOrder', () => {
  it('같은 눈이 연달아 나오지 않는다', () => {
    // 연달아 같으면 멈춘 것처럼 보인다.
    const order = rollOrder(4, 20)
    for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1])
  })

  it('여섯 눈을 모두 지나간다', () => {
    expect(new Set(rollOrder(4, 6)).size).toBe(6)
  })

  it('같은 인자면 같은 차례다', () => {
    // 무작위면 시트를 다시 만들 때마다 달라져 비교할 수 없다.
    expect(rollOrder(2, 10)).toEqual(rollOrder(2, 10))
  })
})

describe('bounceAt', () => {
  it('처음과 끝이 0이다', () => {
    // 끝이 0이 아니면 반복 재생할 때 툭 떨어지는 것이 보인다.
    expect(bounceAt(0, 3, 6)).toBe(0)
    expect(bounceAt(1, 3, 6)).toBe(0)
  })

  it('점점 낮아진다', () => {
    const early = bounceAt(0.12, 3, 20)
    const late = bounceAt(0.72, 3, 20)
    expect(early).toBeGreaterThan(late)
  })

  it('높이를 넘지 않는다', () => {
    for (let i = 0; i <= 100; i++) {
      expect(bounceAt(i / 100, 4, 6)).toBeLessThanOrEqual(6)
      expect(bounceAt(i / 100, 4, 6)).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('makeRoll', () => {
  it('요청한 칸 수만큼 만든다', () => {
    expect(makeRoll({ ...defaultRollOptions, result: 3, frames: 24 })).toHaveLength(24)
  })

  it('마지막 칸들이 결과에 멈춘다', () => {
    const frames = makeRoll({ ...defaultRollOptions, result: 5, frames: 12, settle: 3 })
    for (const f of frames.slice(-3)) expect(f.top).toBe(5)
    expect(frames[frames.length - 1].lift).toBe(0)
  })

  it('한 칸도 잘리지 않는다', () => {
    // 여백보다 높이 띄우면 주사위가 칸 밖으로 나간다.
    const base = opaque(fromSpec(diceSpec(1)))
    for (const f of makeRoll({ ...defaultRollOptions, result: 1, frames: 24, height: 99 })) {
      expect(opaque(f.doc)).toBe(base)
    }
  })

  it('칸 크기가 원본과 같다', () => {
    const one = fromSpec(diceSpec(1))
    for (const f of makeRoll({ ...defaultRollOptions, result: 2, frames: 8 })) {
      expect(f.doc.w).toBe(one.w)
      expect(f.doc.h).toBe(one.h)
    }
  })

  it('실제로 움직인다', () => {
    // 전부 같은 자리면 애니메이션이 아니다.
    const frames = makeRoll({ ...defaultRollOptions, result: 6, frames: 12 })
    expect(new Set(frames.map((f) => f.lift)).size).toBeGreaterThan(1)
    expect(new Set(frames.map((f) => f.top)).size).toBeGreaterThan(1)
  })

  it('같은 인자면 같은 결과다', () => {
    const a = makeRoll({ ...defaultRollOptions, result: 3, frames: 16 })
    const b = makeRoll({ ...defaultRollOptions, result: 3, frames: 16 })
    expect(a.map((f) => `${f.top}:${f.lift}`)).toEqual(b.map((f) => `${f.top}:${f.lift}`))
  })

  it('칸이 둘뿐이어도 터지지 않는다', () => {
    const frames = makeRoll({ ...defaultRollOptions, result: 4, frames: 1, settle: 5 })
    expect(frames.length).toBe(2)
    expect(frames[frames.length - 1].top).toBe(4)
  })

  it('배색을 입힐 수 있다', () => {
    const frames = makeRoll({
      ...defaultRollOptions,
      result: 1,
      frames: 4,
      palette: { ...JSON.parse(JSON.stringify(diceSpec(1).palette)), a: '#00ff88' },
    })
    const used = new Set<string>()
    for (let i = 0; i < frames[0].doc.data.length; i += 4) {
      const d = frames[0].doc.data
      if (d[i + 3] !== 0) used.add(`${d[i]},${d[i + 1]},${d[i + 2]}`)
    }
    expect(used).toContain('0,255,136')
  })
})

describe('rollSheetItems', () => {
  it('칸 순서가 이름에 남는다', () => {
    // 유니티에서 순서대로 재생하려면 이름이 정렬 가능해야 한다.
    const items = rollSheetItems(makeRoll({ ...defaultRollOptions, result: 1, frames: 12 }), 'Roll')
    expect(items[0].name).toBe('Roll_00')
    expect(items[11].name).toBe('Roll_11')
    expect([...items].sort((a, b) => a.name.localeCompare(b.name)).map((i) => i.name)).toEqual(
      items.map((i) => i.name),
    )
  })
})
