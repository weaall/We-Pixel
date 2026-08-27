import { describe, expect, it } from 'vitest'
import type { PixelDoc } from '../src/core/doc'
import { getPixel } from '../src/core/doc'
import { CUBE_FACES, renderCube, rotate } from '../src/core/generate/cube3d'
import type { DiceTop } from '../src/core/generate/diceSet'
import {
  centerInto,
  defaultSpinOptions,
  makeSpin,
  maxScaleFor,
  restRotation,
} from '../src/core/generate/diceSpin'

const TOPS: DiceTop[] = [1, 2, 3, 4, 5, 6]

function bounds(doc: PixelDoc) {
  let minX = doc.w
  let maxX = -1
  let minY = doc.h
  let maxY = -1
  let n = 0
  for (let y = 0; y < doc.h; y++) {
    for (let x = 0; x < doc.w; x++) {
      if (getPixel(doc, x, y)[3] === 0) continue
      n++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return { n, w: maxX - minX + 1, h: maxY - minY + 1, minX, maxX, minY, maxY }
}

describe('restRotation', () => {
  it.each(TOPS)('%d — 그 눈의 면이 위를 본다', (top) => {
    // 면 배정은 cube3d 에 고정되어 있다. 자세가 어긋나면 멈춘 칸에서 다른 눈이 보인다.
    const rot = restRotation(top)
    const face = CUBE_FACES.find((f) => f.pips === top)
    expect(face).toBeDefined()
    const n = rotate((face as { normal: { x: number; y: number; z: number } }).normal, rot)
    expect(n.y).toBeCloseTo(1, 5)
  })

  it('마주보는 면은 아래를 본다', () => {
    // 합이 7이어야 실제 주사위다.
    for (const top of TOPS) {
      const opposite = CUBE_FACES.find((f) => f.pips === 7 - top)
      const n = rotate((opposite as { normal: { x: number; y: number; z: number } }).normal, restRotation(top))
      expect(n.y).toBeCloseTo(-1, 5)
    }
  })
})

describe('renderCube', () => {
  it('큐브가 그려진다', () => {
    const doc = renderCube({ size: 64, rot: { x: 0, y: 0, z: 0 }, scale: 26 })
    const b = bounds(doc)
    expect(b.n).toBeGreaterThan(1000)
    // 등축 큐브는 세로가 가로보다 길다.
    expect(b.h).toBeGreaterThan(b.w)
  })

  it('돌리면 실루엣이 달라진다', () => {
    // 달라지지 않으면 회전이 아니라 같은 그림이다.
    const shape = (deg: number) => {
      const doc = renderCube({
        size: 64,
        rot: { x: 0, y: (deg * Math.PI) / 180, z: 0 },
        scale: 26,
      })
      return doc.data.join('')
    }
    expect(shape(0)).not.toBe(shape(20))
    expect(shape(0)).not.toBe(shape(45))
  })

  it('90도 돌리면 실루엣이 같다', () => {
    // 큐브는 네 번 돌면 제자리다. 안 맞으면 회전 축이나 순서가 틀렸다.
    const at = (deg: number) =>
      bounds(
        renderCube({ size: 64, rot: { x: 0, y: (deg * Math.PI) / 180, z: 0 }, scale: 26 }),
      )
    const a = at(0)
    const b = at(90)
    expect(b.w).toBe(a.w)
    expect(b.h).toBe(a.h)
  })

  it('가운데에 그린다', () => {
    const b = bounds(renderCube({ size: 64, rot: { x: 0, y: 0, z: 0 }, scale: 26 }))
    expect(Math.abs(b.minX - (64 - b.maxX - 1))).toBeLessThanOrEqual(1)
  })

  it('눈을 끌 수 있다', () => {
    const withPips = renderCube({ size: 64, rot: { x: 0, y: 0, z: 0 }, scale: 26 })
    const without = renderCube({ size: 64, rot: { x: 0, y: 0, z: 0 }, scale: 26, pips: false })
    expect(withPips.data.join('')).not.toBe(without.data.join(''))
    // 실루엣은 같아야 한다. 눈은 면 안쪽에만 있다.
    expect(bounds(withPips).n).toBe(bounds(without).n)
  })
})

describe('maxScaleFor', () => {
  it('칸이 클수록 크게 그릴 수 있다', () => {
    expect(maxScaleFor(72, 6)).toBeGreaterThan(maxScaleFor(64, 6))
  })

  it('띄우는 만큼 줄어든다', () => {
    expect(maxScaleFor(72, 0)).toBeGreaterThan(maxScaleFor(72, 6))
  })
})

describe('centerInto', () => {
  it('작은 그림을 큰 칸 가운데에 놓는다', () => {
    const doc = renderCube({ size: 32, rot: { x: 0, y: 0, z: 0 }, scale: 12 })
    const out = centerInto(doc, 48)
    expect(out.w).toBe(48)
    const b = bounds(out)
    expect(Math.abs(b.minX - (48 - b.maxX - 1))).toBeLessThanOrEqual(1)
  })

  it('같은 크기면 그대로 돌려준다', () => {
    const doc = renderCube({ size: 32, rot: { x: 0, y: 0, z: 0 }, scale: 12 })
    expect(Array.from(centerInto(doc, 32).data)).toEqual(Array.from(doc.data))
  })
})

describe('makeSpin', () => {
  it('요청한 칸 수만큼 만든다', () => {
    expect(makeSpin({ ...defaultSpinOptions, result: 3, frames: 20 })).toHaveLength(20)
  })

  it.each(TOPS)('%d — 어느 칸도 가장자리에 닿지 않는다', (result) => {
    // 닿으면 돌다가 모서리가 잘린다. 배율과 칸 크기의 관계가 깨졌다는 뜻이다.
    for (const f of makeSpin({ ...defaultSpinOptions, result })) {
      const b = bounds(f.doc)
      expect(b.minX).toBeGreaterThan(0)
      expect(b.minY).toBeGreaterThan(0)
      expect(b.maxX).toBeLessThan(f.doc.w - 1)
      expect(b.maxY).toBeLessThan(f.doc.h - 1)
    }
  })

  it('마지막 칸은 사람이 그린 원본이다', () => {
    const frames = makeSpin({ ...defaultSpinOptions, result: 5, settle: 2 })
    expect(frames[frames.length - 1].artwork).toBe(true)
    expect(frames[frames.length - 1].lift).toBe(0)
  })

  it('render 로 두면 전부 계산해서 그린다', () => {
    const frames = makeSpin({ ...defaultSpinOptions, result: 5, finish: 'render' })
    expect(frames.every((f) => !f.artwork)).toBe(true)
  })

  it('실제로 회전한다', () => {
    // 눈만 바꾸는 연출과 달리 실루엣이 칸마다 달라져야 한다.
    const frames = makeSpin({ ...defaultSpinOptions, result: 2, frames: 12, finish: 'render' })
    const shapes = new Set(frames.map((f) => `${bounds(f.doc).w}x${bounds(f.doc).h}`))
    expect(shapes.size).toBeGreaterThan(3)
  })

  it('칸 크기가 모두 같다', () => {
    // 섞이면 시트 슬라이스가 어긋난다.
    const frames = makeSpin({ ...defaultSpinOptions, result: 1, frames: 10 })
    for (const f of frames) {
      expect(f.doc.w).toBe(defaultSpinOptions.size)
      expect(f.doc.h).toBe(defaultSpinOptions.size)
    }
  })

  it('같은 인자면 같은 결과다', () => {
    const a = makeSpin({ ...defaultSpinOptions, result: 4, frames: 8 })
    const b = makeSpin({ ...defaultSpinOptions, result: 4, frames: 8 })
    expect(a.map((f) => f.doc.data.join(''))).toEqual(b.map((f) => f.doc.data.join('')))
  })

  it('칸이 둘뿐이어도 터지지 않는다', () => {
    expect(makeSpin({ ...defaultSpinOptions, result: 6, frames: 1 })).toHaveLength(2)
  })
})
