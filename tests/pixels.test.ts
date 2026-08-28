import { describe, expect, it } from 'vitest'
import { resample, toLogicalGrid } from '../src/core/resample'
import { fromHsl, parseHex, toHex } from '../src/core/color'
import { TooManyColorsError, fromSpec, packRows, toSpec, unpackRows, usedColors } from '../src/core/codec'
import { MAX_SIZE, contentBounds, createDoc, getPixel, resizeDoc, setPixel } from '../src/core/doc'
import type { PixelDoc } from '../src/core/doc'
import { History } from '../src/core/history'
import {
  defaultStampOptions,
  drawLine,
  drawRect,
  floodFill,
  stamp,
  stampCells,
} from '../src/core/tools'
import type { RGBA } from '../src/core/color'

const RED: RGBA = [255, 0, 0, 255]
const WHITE: RGBA = [255, 255, 255, 255]
const so = defaultStampOptions

/** 불투명 픽셀 수. 여러 테스트에서 결과를 세는 데 쓴다. */
function opaqueCount(doc: PixelDoc): number {
  let n = 0
  for (let i = 3; i < doc.data.length; i += 4) if (doc.data[i] !== 0) n++
  return n
}

describe('color', () => {
  it('3/6/8자리 hex를 파싱한다', () => {
    expect(parseHex('#f00')).toEqual([255, 0, 0, 255])
    expect(parseHex('#ff0000')).toEqual([255, 0, 0, 255])
    expect(parseHex('#ff000080')).toEqual([255, 0, 0, 128])
  })

  it('잘못된 입력은 null이다', () => {
    expect(parseHex('zzz')).toBeNull()
    expect(parseHex('#ff00')).toBeNull()
    expect(parseHex('')).toBeNull()
  })

  it('알파가 255면 6자리로 되돌린다', () => {
    expect(toHex([255, 0, 0, 255])).toBe('#ff0000')
    expect(toHex([255, 0, 0, 128])).toBe('#ff000080')
  })

  it('HSL 채도 0은 무채색이다', () => {
    const [r, g, b] = fromHsl(0, 0, 0.5)
    expect(r).toBeCloseTo(g, 5)
    expect(g).toBeCloseTo(b, 5)
  })
})

describe('doc', () => {
  it('범위 밖 좌표는 투명을 돌려주고 쓰기는 무시한다', () => {
    const doc = createDoc(4, 4)
    expect(getPixel(doc, -1, 0)).toEqual([0, 0, 0, 0])
    setPixel(doc, 99, 99, RED)
    expect(opaqueCount(doc)).toBe(0)
  })

  it('크기를 바꿔도 겹치는 영역은 보존된다', () => {
    const doc = createDoc(8, 8)
    setPixel(doc, 2, 3, RED)
    expect(getPixel(resizeDoc(doc, 16, 16), 2, 3)).toEqual(RED)
    // 잘려 나가는 쪽도 남은 부분은 유지되어야 한다
    expect(getPixel(resizeDoc(doc, 4, 4), 2, 3)).toEqual(RED)
  })

  it('그려진 영역의 경계를 찾는다', () => {
    const doc = createDoc(10, 10)
    expect(contentBounds(doc)).toBeNull()
    setPixel(doc, 3, 4, RED)
    setPixel(doc, 6, 8, RED)
    expect(contentBounds(doc)).toEqual({ x: 3, y: 4, w: 4, h: 5 })
  })
})

describe('tools', () => {
  it('대칭 스탬프는 반대편에도 찍는다', () => {
    const doc = createDoc(9, 9)
    stamp(doc, 1, 4, WHITE, { size: 1, mirrorX: true, mirrorY: false })
    expect(getPixel(doc, 1, 4)[3]).toBe(255)
    expect(getPixel(doc, 7, 4)[3]).toBe(255)
    expect(opaqueCount(doc)).toBe(2)
  })

  it('대각선이 끊기지 않는다', () => {
    const doc = createDoc(16, 16)
    drawLine(doc, 0, 0, 15, 15, WHITE, so)
    for (let i = 0; i < 16; i++) expect(getPixel(doc, i, i)[3]).toBe(255)
  })

  it('사각형 외곽선은 내부를 비운다', () => {
    const doc = createDoc(16, 16)
    drawRect(doc, 2, 2, 12, 10, WHITE, so, false)
    expect(getPixel(doc, 2, 2)[3]).toBe(255)
    expect(getPixel(doc, 12, 10)[3]).toBe(255)
    expect(getPixel(doc, 7, 6)[3]).toBe(0)
  })

  it('플러드 필이 경계를 넘지 않는다', () => {
    const doc = createDoc(16, 16)
    drawRect(doc, 4, 4, 11, 11, WHITE, so, false)
    floodFill(doc, 8, 8, RED)
    expect(getPixel(doc, 8, 8)).toEqual(RED)
    expect(getPixel(doc, 0, 0)[3]).toBe(0)
  })

  it('큰 캔버스를 채워도 스택이 넘치지 않는다', () => {
    const doc = createDoc(256, 256)
    floodFill(doc, 0, 0, RED)
    expect(opaqueCount(doc)).toBe(256 * 256)
  })

  it('커서 표시 칸은 대칭이 겹쳐도 중복되지 않는다', () => {
    const doc = createDoc(9, 9)
    // 가운데 열은 미러 위치가 자기 자신이라 두 번 나올 수 있다
    const cells = stampCells(doc, 4, 4, { size: 1, mirrorX: true, mirrorY: true })
    expect(cells).toEqual([{ x: 4, y: 4 }])
  })

  it('커서 표시 칸은 캔버스 밖을 포함하지 않는다', () => {
    const doc = createDoc(8, 8)
    const cells = stampCells(doc, 0, 0, { size: 5, mirrorX: false, mirrorY: false })
    expect(cells.every((c) => c.x >= 0 && c.y >= 0 && c.x < 8 && c.y < 8)).toBe(true)
  })
})

describe('history', () => {
  it('되돌리기와 다시 실행이 왕복한다', () => {
    const doc = createDoc(8, 8)
    const history = new History()

    history.commit(doc)
    setPixel(doc, 3, 3, WHITE)

    const undone = history.undo(doc)
    expect(undone).not.toBeNull()
    expect(getPixel(undone!, 3, 3)[3]).toBe(0)

    const redone = history.redo(undone!)
    expect(getPixel(redone!, 3, 3)[3]).toBe(255)
  })

  it('새로 기록하면 다시 실행 스택이 비워진다', () => {
    const doc = createDoc(4, 4)
    const history = new History()
    history.commit(doc)
    const undone = history.undo(doc)!
    expect(history.canRedo).toBe(true)

    history.commit(undone)
    expect(history.canRedo).toBe(false)
  })

  it('빈 상태에서는 null을 돌려준다', () => {
    const history = new History()
    expect(history.undo(createDoc(4, 4))).toBeNull()
    expect(history.redo(createDoc(4, 4))).toBeNull()
  })

  it('한도를 넘으면 오래된 것부터 버린다', () => {
    const doc = createDoc(4, 4)
    const history = new History(2)
    history.commit(doc)
    history.commit(doc)
    history.commit(doc)
    expect(history.undo(doc)).not.toBeNull()
    expect(history.undo(doc)).not.toBeNull()
    expect(history.undo(doc)).toBeNull()
  })
})

describe('codec', () => {
  it('문서 → spec → 문서가 바이트까지 같다', () => {
    const doc = createDoc(6, 4)
    setPixel(doc, 0, 0, RED)
    setPixel(doc, 5, 3, [10, 200, 30, 255])
    const back = fromSpec(toSpec(doc))
    expect(Array.from(back.data)).toEqual(Array.from(doc.data))
  })

  it('투명이 있으면 팔레트에 명시한다', () => {
    const doc = createDoc(4, 4)
    setPixel(doc, 0, 0, RED)
    expect(toSpec(doc).palette['.']).toBe('transparent')
  })

  it('색이 한계를 넘으면 던진다', () => {
    const doc = createDoc(16, 16)
    for (let i = 0; i < 100; i++) setPixel(doc, i % 16, Math.floor(i / 16), [i * 2, i, 255 - i, 255])
    expect(() => toSpec(doc)).toThrow(TooManyColorsError)
  })

  it('행 길이가 어긋나면 조용히 넘어가지 않는다', () => {
    expect(() =>
      fromSpec({ w: 4, h: 2, palette: { k: '#000' }, rows: ['kkkk', 'kkk'] }),
    ).toThrow()
  })

  it('팔레트에 없는 문자를 거부한다', () => {
    expect(() =>
      fromSpec({ w: 2, h: 1, palette: { k: '#000' }, rows: ['kZ'] }),
    ).toThrow()
  })

  it('사용 중인 색을 빈도 순으로 돌려준다', () => {
    const doc = createDoc(4, 1)
    setPixel(doc, 0, 0, RED)
    setPixel(doc, 1, 0, RED)
    setPixel(doc, 2, 0, WHITE)
    const used = usedColors(doc)
    expect(used[0]).toEqual({ hex: '#ff0000', count: 2 })
    expect(used[1]).toEqual({ hex: '#ffffff', count: 1 })
  })
})

describe('toLogicalGrid', () => {
  it('정수배로 늘린 그림을 원래 격자로 되돌린다', () => {
    const src = createDoc(4, 4)
    setPixel(src, 1, 1, [255, 0, 0, 255])
    setPixel(src, 2, 2, [0, 0, 255, 255])
    const big = resample(src, 12, 12, 'nearest')

    const { doc, scale } = toLogicalGrid(big)
    expect(scale).toBe(3)
    expect(doc.w).toBe(4)
    expect(Array.from(doc.data)).toEqual(Array.from(src.data))
  })

  it('원래 격자인 그림은 건드리지 않는다', () => {
    const src = createDoc(8, 8)
    for (let x = 0; x < 8; x++) setPixel(src, x, x, [255, 0, 0, 255])
    const { doc, scale } = toLogicalGrid(src)
    expect(scale).toBe(1)
    expect(Array.from(doc.data)).toEqual(Array.from(src.data))
  })

  it('원본에 없던 색을 만들지 않는다', () => {
    // 평균을 내면 블록이 어긋났을 때 중간색이 생기고, 색 교체가 더 이상
    // 그 색을 잡지 못한다. 다수결로 고르면 항상 원본에 있던 색이다.
    const src = createDoc(3, 3)
    setPixel(src, 0, 0, [255, 0, 0, 255])
    setPixel(src, 1, 1, [0, 0, 255, 255])
    setPixel(src, 2, 2, [0, 255, 0, 255])
    const big = resample(src, 12, 12, 'nearest')

    const colorsOf = (d: PixelDoc) => {
      const set = new Set<string>()
      for (let i = 0; i < d.data.length; i += 4) {
        set.add(`${d.data[i]},${d.data[i + 1]},${d.data[i + 2]},${d.data[i + 3]}`)
      }
      return set
    }
    const before = colorsOf(big)
    const { doc } = toLogicalGrid(big)
    for (const color of colorsOf(doc)) expect(before.has(color)).toBe(true)
  })
})

describe('가장 큰 캔버스', () => {
  it('MAX_SIZE 문서가 spec 을 왕복한다', () => {
    // 256 은 65,536칸이다. 행 길이나 접기가 어긋나면 여기서 드러난다.
    const doc = createDoc(MAX_SIZE, MAX_SIZE)
    for (let i = 0; i < MAX_SIZE; i++) setPixel(doc, i, i, [255, 0, 0, 255])
    for (let i = 0; i < MAX_SIZE; i++) setPixel(doc, i, MAX_SIZE - 1 - i, [0, 0, 255, 255])

    const spec = toSpec(doc)
    expect(spec.w).toBe(MAX_SIZE)
    expect(new Set(spec.rows.map((r) => r.length))).toEqual(new Set([MAX_SIZE]))
    expect(Array.from(fromSpec(spec).data)).toEqual(Array.from(doc.data))
  })

  it('MAX_SIZE 행도 접었다 펴진다', () => {
    const doc = createDoc(MAX_SIZE, 2)
    for (let x = 0; x < MAX_SIZE; x++) setPixel(doc, x, 0, [1, 2, 3, 255])
    const spec = toSpec(doc)
    expect(unpackRows(packRows(spec), MAX_SIZE)).toEqual(spec.rows)
  })
})
