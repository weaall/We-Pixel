import { describe, expect, it } from 'vitest'
import type { RGBA } from '../src/core/color'
import { anchorOffset, composite } from '../src/core/compose'
import { createDoc, getPixel, setPixel } from '../src/core/doc'
import type { PixelDoc } from '../src/core/doc'
import {
  clampRect,
  clearRegion,
  containsPoint,
  contentRect,
  copyRegion,
  moveRegion,
  pasteAt,
  rectFromPoints,
} from '../src/core/selection'

const RED: RGBA = [255, 0, 0, 255]
const BLUE: RGBA = [0, 0, 255, 255]

function opaque(doc: PixelDoc): number {
  let n = 0
  for (let i = 3; i < doc.data.length; i += 4) if (doc.data[i] !== 0) n++
  return n
}

describe('rectFromPoints', () => {
  it('어느 방향으로 끌어도 같은 사각형이 나온다', () => {
    const a = rectFromPoints(2, 3, 5, 7)
    const b = rectFromPoints(5, 7, 2, 3)
    expect(a).toEqual(b)
    expect(a).toEqual({ x: 2, y: 3, w: 4, h: 5 })
  })

  it('한 점을 찍으면 1x1 이다', () => {
    expect(rectFromPoints(4, 4, 4, 4)).toEqual({ x: 4, y: 4, w: 1, h: 1 })
  })
})

describe('clampRect', () => {
  const doc = createDoc(10, 10)

  it('캔버스 밖으로 나간 부분을 자른다', () => {
    expect(clampRect({ x: -3, y: -3, w: 6, h: 6 }, doc)).toEqual({ x: 0, y: 0, w: 3, h: 3 })
    expect(clampRect({ x: 8, y: 8, w: 6, h: 6 }, doc)).toEqual({ x: 8, y: 8, w: 2, h: 2 })
  })

  it('완전히 벗어나면 null 이다', () => {
    expect(clampRect({ x: 20, y: 20, w: 4, h: 4 }, doc)).toBeNull()
    expect(clampRect({ x: -10, y: 0, w: 5, h: 5 }, doc)).toBeNull()
  })
})

describe('containsPoint', () => {
  it('오른쪽/아래 경계는 포함하지 않는다', () => {
    const rect = { x: 2, y: 2, w: 3, h: 3 }
    expect(containsPoint(rect, 2, 2)).toBe(true)
    expect(containsPoint(rect, 4, 4)).toBe(true)
    expect(containsPoint(rect, 5, 4)).toBe(false)
    expect(containsPoint(rect, 1, 2)).toBe(false)
  })
})

describe('copyRegion / clearRegion', () => {
  function sample(): PixelDoc {
    const doc = createDoc(6, 6)
    setPixel(doc, 1, 1, RED)
    setPixel(doc, 2, 1, RED)
    setPixel(doc, 4, 4, BLUE)
    return doc
  }

  it('선택 영역만 떠낸다', () => {
    const clip = copyRegion(sample(), { x: 1, y: 1, w: 2, h: 1 })
    expect(clip.w).toBe(2)
    expect(clip.h).toBe(1)
    expect(getPixel(clip, 0, 0)).toEqual(RED)
    expect(getPixel(clip, 1, 0)).toEqual(RED)
  })

  it('원본을 훼손하지 않는다', () => {
    const doc = sample()
    copyRegion(doc, { x: 1, y: 1, w: 2, h: 1 })
    expect(getPixel(doc, 1, 1)).toEqual(RED)
  })

  it('영역 밖은 건드리지 않고 비운다', () => {
    const doc = sample()
    const cleared = clearRegion(doc, { x: 1, y: 1, w: 2, h: 1 })
    expect(cleared).toBe(2)
    expect(getPixel(doc, 1, 1)[3]).toBe(0)
    expect(getPixel(doc, 4, 4)).toEqual(BLUE)
  })

  it('캔버스를 넘는 선택도 안전하다', () => {
    const doc = sample()
    expect(() => clearRegion(doc, { x: 4, y: 4, w: 99, h: 99 })).not.toThrow()
    expect(getPixel(doc, 4, 4)[3]).toBe(0)
  })
})

describe('moveRegion', () => {
  it('원래 자리는 비고 새 자리에 옮겨진다', () => {
    const doc = createDoc(8, 8)
    setPixel(doc, 1, 1, RED)
    const out = moveRegion(doc, { x: 1, y: 1, w: 1, h: 1 }, 3, 2)
    expect(getPixel(out.doc, 1, 1)[3]).toBe(0)
    expect(getPixel(out.doc, 4, 3)).toEqual(RED)
    expect(out.rect).toEqual({ x: 4, y: 3, w: 1, h: 1 })
  })

  it('픽셀 수가 유지된다', () => {
    const doc = createDoc(8, 8)
    setPixel(doc, 1, 1, RED)
    setPixel(doc, 2, 1, RED)
    setPixel(doc, 6, 6, BLUE)
    const out = moveRegion(doc, { x: 1, y: 1, w: 2, h: 1 }, 2, 2)
    expect(opaque(out.doc)).toBe(3)
  })

  it('캔버스를 넘어간 부분은 잘린다', () => {
    // 붙이려고 캔버스가 멋대로 커지면 유니티 스프라이트 크기가 어긋난다.
    const doc = createDoc(4, 4)
    setPixel(doc, 0, 0, RED)
    const out = moveRegion(doc, { x: 0, y: 0, w: 1, h: 1 }, 10, 0)
    expect(out.doc.w).toBe(4)
    expect(opaque(out.doc)).toBe(0)
  })

  it('원본을 훼손하지 않는다', () => {
    const doc = createDoc(8, 8)
    setPixel(doc, 1, 1, RED)
    moveRegion(doc, { x: 1, y: 1, w: 1, h: 1 }, 3, 3)
    expect(getPixel(doc, 1, 1)).toEqual(RED)
  })
})

describe('pasteAt', () => {
  it('지정한 위치에 붙인다', () => {
    const doc = createDoc(8, 8)
    const clip = createDoc(2, 2)
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) setPixel(clip, x, y, BLUE)

    const out = pasteAt(doc, clip, 3, 4)
    expect(getPixel(out.doc, 3, 4)).toEqual(BLUE)
    expect(getPixel(out.doc, 4, 5)).toEqual(BLUE)
    expect(out.rect).toEqual({ x: 3, y: 4, w: 2, h: 2 })
  })

  it('front 는 덮고 behind 는 원본을 남긴다', () => {
    const doc = createDoc(2, 1)
    setPixel(doc, 0, 0, RED)
    const clip = createDoc(1, 1)
    setPixel(clip, 0, 0, BLUE)

    expect(getPixel(pasteAt(doc, clip, 0, 0, 'front').doc, 0, 0)).toEqual(BLUE)
    expect(getPixel(pasteAt(doc, clip, 0, 0, 'behind').doc, 0, 0)).toEqual(RED)
  })

  it('투명 픽셀은 붙이지 않는다', () => {
    const doc = createDoc(2, 1)
    setPixel(doc, 0, 0, RED)
    const clip = createDoc(2, 1) // 전부 투명
    expect(getPixel(pasteAt(doc, clip, 0, 0, 'front').doc, 0, 0)).toEqual(RED)
  })
})

describe('contentRect', () => {
  it('그려진 부분만 감싼다', () => {
    const doc = createDoc(10, 10)
    setPixel(doc, 3, 4, RED)
    setPixel(doc, 6, 8, RED)
    expect(contentRect(doc)).toEqual({ x: 3, y: 4, w: 4, h: 5 })
  })

  it('빈 캔버스는 null 이다', () => {
    expect(contentRect(createDoc(4, 4))).toBeNull()
  })
})

describe('composite / anchorOffset', () => {
  it('앵커를 좌상단 좌표로 바꾼다', () => {
    const base = { w: 10, h: 10 }
    const add = { w: 4, h: 4 }
    expect(anchorOffset(base, add, 'top-left')).toEqual({ x: 0, y: 0 })
    expect(anchorOffset(base, add, 'center')).toEqual({ x: 3, y: 3 })
    expect(anchorOffset(base, add, 'bottom-right')).toEqual({ x: 6, y: 6 })
    expect(anchorOffset(base, add, 'top-right')).toEqual({ x: 6, y: 0 })
  })

  it('붙이는 그림이 더 크면 음수 오프셋이 나온다', () => {
    // 잘려 들어가는 것이 맞다. 캔버스를 키우지 않는다.
    expect(anchorOffset({ w: 4, h: 4 }, { w: 10, h: 10 }, 'center')).toEqual({ x: -3, y: -3 })
  })

  it('오프셋을 주고 합칠 수 있다', () => {
    const base = createDoc(6, 6)
    const add = createDoc(2, 2)
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) setPixel(add, x, y, BLUE)
    const out = composite(base, add, { mode: 'front', x: 4, y: 4 })
    expect(getPixel(out.doc, 4, 4)).toEqual(BLUE)
    expect(out.added).toBe(4)
  })

  it('캔버스를 넘는 부분은 세지 않는다', () => {
    const base = createDoc(4, 4)
    const add = createDoc(4, 4)
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) setPixel(add, x, y, BLUE)
    const out = composite(base, add, { mode: 'front', x: 2, y: 2 })
    expect(out.added).toBe(4)
  })
})
