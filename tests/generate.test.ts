import { describe, expect, it } from 'vitest'
import { toSpec } from '../src/core/codec'
import { contentBounds, getPixel } from '../src/core/doc'
import type { PixelDoc } from '../src/core/doc'
import { defaultPatternOptions, generatePattern } from '../src/core/generate/pattern'
import { hashSeed, mulberry32, resolveSeed } from '../src/core/generate/rng'
import { defaultDiceOptions, generateDice, randomPips } from '../src/core/generate/dice'
import type { DiceMaterial } from '../src/core/generate/dice'
import { defaultSpriteOptions, generateSprite } from '../src/core/generate/sprite'
import type { SpriteShape } from '../src/core/generate/sprite'

const SEEDS = [1, 7, 1000, 8919, 16838, 24757, 99991]

function sprite(seed: number, over: Partial<typeof defaultSpriteOptions> = {}): PixelDoc {
  return generateSprite({ ...defaultSpriteOptions, ...over, seed })
}

function opaqueCount(doc: PixelDoc): number {
  let n = 0
  for (let i = 3; i < doc.data.length; i += 4) if (doc.data[i] !== 0) n++
  return n
}

function distinctColors(doc: PixelDoc): number {
  const seen = new Set<number>()
  for (let i = 0; i < doc.data.length; i += 4) {
    if (doc.data[i + 3] === 0) continue
    seen.add((doc.data[i] << 16) | (doc.data[i + 1] << 8) | doc.data[i + 2])
  }
  return seen.size
}

/** 불투명 픽셀이 4방향으로 하나의 덩어리인지. */
function isConnected(doc: PixelDoc): boolean {
  const total = opaqueCount(doc)
  if (total === 0) return false
  let start = -1
  for (let i = 0; i < doc.w * doc.h; i++) {
    if (doc.data[i * 4 + 3] !== 0) {
      start = i
      break
    }
  }
  const seen = new Uint8Array(doc.w * doc.h)
  const stack = [start]
  seen[start] = 1
  let n = 0
  while (stack.length > 0) {
    const i = stack.pop()!
    n++
    const x = i % doc.w
    const y = (i / doc.w) | 0
    const push = (j: number) => {
      if (!seen[j] && doc.data[j * 4 + 3] !== 0) {
        seen[j] = 1
        stack.push(j)
      }
    }
    if (x > 0) push(i - 1)
    if (x < doc.w - 1) push(i + 1)
    if (y > 0) push(i - doc.w)
    if (y < doc.h - 1) push(i + doc.w)
  }
  return n === total
}

describe('rng', () => {
  it('같은 시드는 같은 수열을 낸다', () => {
    const a = Array.from({ length: 8 }, mulberry32(42))
    const b = Array.from({ length: 8 }, mulberry32(42))
    expect(a).toEqual(b)
    expect(Array.from({ length: 8 }, mulberry32(43))).not.toEqual(a)
  })

  it('숫자 시드는 그대로, 단어는 해시로 푼다', () => {
    expect(resolveSeed('1234')).toBe(1234)
    expect(resolveSeed('goblin')).toBe(hashSeed('goblin'))
    expect(resolveSeed('goblin')).toBe(resolveSeed('goblin'))
  })
})

describe('generateSprite', () => {
  it('같은 시드는 바이트까지 같은 결과를 낸다', () => {
    for (const seed of SEEDS) {
      expect(Array.from(sprite(seed).data)).toEqual(Array.from(sprite(seed).data))
    }
  })

  it('시드가 다르면 결과도 다르다', () => {
    const seen = new Set(SEEDS.map((s) => sprite(s).data.join(',')))
    expect(seen.size).toBe(SEEDS.length)
  })

  it('빈 스프라이트를 내지 않는다', () => {
    // 임계값 재시도가 동작하지 않으면 여기서 걸린다.
    for (const seed of SEEDS) {
      expect(opaqueCount(sprite(seed))).toBeGreaterThan(32 * 32 * 0.05)
    }
  })

  it('하나로 이어진 덩어리를 낸다', () => {
    // 파편이 남으면 1배율에서 잡티로 보인다.
    for (const seed of SEEDS) expect(isConnected(sprite(seed))).toBe(true)
  })

  it('외곽선이 잘리지 않도록 가장자리를 비운다', () => {
    for (const seed of SEEDS) {
      const doc = sprite(seed)
      const bounds = contentBounds(doc)!
      expect(bounds.x).toBeGreaterThanOrEqual(0)
      expect(bounds.y).toBeGreaterThanOrEqual(0)
      expect(bounds.x + bounds.w).toBeLessThanOrEqual(doc.w)
      expect(bounds.y + bounds.h).toBeLessThanOrEqual(doc.h)
    }
  })

  it('좌우 대칭을 켜면 실루엣이 정확히 대칭이다', () => {
    // mirrorX가 보장하는 것은 형태이지 색이 아니다. 아래 테스트를 함께 볼 것.
    const doc = sprite(1000, { mirrorX: true, accent: false })
    for (let y = 0; y < doc.h; y++) {
      for (let x = 0; x < doc.w; x++) {
        expect(getPixel(doc, x, y)[3]).toBe(getPixel(doc, doc.w - 1 - x, y)[3])
      }
    }
  })

  it('실루엣이 대칭이어도 명암은 비대칭이다', () => {
    // 광원이 왼쪽 위에 있다. 색까지 대칭이면 입체감이 사라져 납작해 보인다.
    const doc = sprite(1000, { mirrorX: true, accent: false, shading: true })
    let differing = 0
    for (let y = 0; y < doc.h; y++) {
      for (let x = 0; x < doc.w / 2; x++) {
        const a = getPixel(doc, x, y)
        const b = getPixel(doc, doc.w - 1 - x, y)
        if (a[3] !== 0 && a.join() !== b.join()) differing++
      }
    }
    expect(differing).toBeGreaterThan(0)
  })

  it('명암을 켜면 색 단계가 늘어난다', () => {
    // 이전에는 경계만 두 톤이라 납작했다. 다섯 단계가 나와야 볼륨이 보인다.
    const flat = sprite(1000, { shading: false, outline: false, accent: false })
    const shaded = sprite(1000, { shading: true, outline: false, accent: false })
    expect(distinctColors(flat)).toBe(1)
    expect(distinctColors(shaded)).toBeGreaterThanOrEqual(4)
  })

  it('밝은 단계일수록 색조가 따뜻한 쪽으로 이동한다', () => {
    // 명도만 바꾼 램프는 탁해 보인다. 색조 이동이 실제로 일어나는지 본다.
    const doc = sprite(1000, { hue: 210 })
    const colors = new Map<string, number>()
    for (let i = 0; i < doc.data.length; i += 4) {
      if (doc.data[i + 3] === 0) continue
      const key = `${doc.data[i]},${doc.data[i + 1]},${doc.data[i + 2]}`
      colors.set(key, (colors.get(key) ?? 0) + 1)
    }
    const hues = [...colors.keys()].map((k) => {
      const [r, g, b] = k.split(',').map(Number)
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const l = (max + min) / 2 / 255
      let hue = 0
      if (max !== min) {
        const d = max - min
        if (max === r) hue = ((g - b) / d) % 6
        else if (max === g) hue = (b - r) / d + 2
        else hue = (r - g) / d + 4
        hue = ((hue * 60) % 360 + 360) % 360
      }
      return { hue, l }
    })
    const light = hues.filter((c) => c.l > 0.6)
    const dark = hues.filter((c) => c.l < 0.3)
    expect(light.length).toBeGreaterThan(0)
    expect(dark.length).toBeGreaterThan(0)
    // 210도 기준이므로 밝은 쪽은 더 큰 각도(청록 쪽), 어두운 쪽은 더 작은 각도로 간다.
    expect(Math.max(...light.map((c) => c.hue))).toBeGreaterThan(
      Math.min(...dark.map((c) => c.hue)),
    )
  })

  it('체형이 시드마다 지켜진다', () => {
    // 평균만 보면 개별 시드에서 체형이 뒤집혀도 통과한다.
    // "납작"을 골랐는데 세로로 긴 결과가 나오던 버그가 그렇게 숨어 있었다.
    for (const seed of SEEDS) {
      const wide = contentBounds(sprite(seed, { shape: 'wide', accent: false }))!
      const tall = contentBounds(sprite(seed, { shape: 'tall', accent: false }))!
      expect(wide.w / wide.h).toBeGreaterThan(1)
      expect(tall.h / tall.w).toBeGreaterThan(1)
    }
  })

  it('spec으로 저장할 수 있다 (색 한도 안)', () => {
    // 여기서 던지면 유니티 export가 통째로 막힌다.
    for (const seed of SEEDS) expect(() => toSpec(sprite(seed))).not.toThrow()
  })

  it('작은 캔버스에서도 형태가 나온다', () => {
    for (const size of [8, 12, 16]) {
      const doc = sprite(1000, { w: size, h: size })
      expect(opaqueCount(doc)).toBeGreaterThan(0)
    }
  })
})

describe('generatePattern', () => {
  it('같은 시드는 같은 결과를 낸다', () => {
    const a = generatePattern({ ...defaultPatternOptions, seed: 7 })
    const b = generatePattern({ ...defaultPatternOptions, seed: 7 })
    expect(Array.from(a.data)).toEqual(Array.from(b.data))
  })

  it('요청한 단계 수를 넘지 않는다', () => {
    for (const steps of [2, 4, 8]) {
      const doc = generatePattern({ ...defaultPatternOptions, seed: 3, steps })
      expect(distinctColors(doc)).toBeLessThanOrEqual(steps)
    }
  })

  it('전체를 채운다', () => {
    const doc = generatePattern({ ...defaultPatternOptions, seed: 3 })
    expect(opaqueCount(doc)).toBe(doc.w * doc.h)
  })

  it('이음선 없는 타일은 양쪽 끝이 이어진다', () => {
    const doc = generatePattern({ ...defaultPatternOptions, seed: 5, seamless: true, steps: 6 })
    let mismatch = 0
    for (let y = 0; y < doc.h; y++) {
      if (getPixel(doc, 0, y).join() !== getPixel(doc, doc.w - 1, y).join()) mismatch++
    }
    // 양자화 때문에 완전 일치는 아니지만, 이어지지 않으면 대부분의 행이 어긋난다.
    expect(mismatch).toBeLessThan(doc.h * 0.35)
  })
})

describe('generateDice', () => {
  const dice = (over: Partial<typeof defaultDiceOptions> = {}, seed = 7) =>
    generateDice({ ...defaultDiceOptions, ...over, seed })

  it('같은 시드와 옵션이면 같은 결과가 나온다', () => {
    expect(Array.from(dice().data)).toEqual(Array.from(dice().data))
  })

  it('빈 그림을 내지 않는다', () => {
    expect(opaqueCount(dice())).toBeGreaterThan(32 * 32 * 0.3)
  })

  it('하나로 이어진 덩어리다', () => {
    expect(isConnected(dice())).toBe(true)
  })

  it('좌우로 대칭인 실루엣이다', () => {
    // 등축 큐브는 세로축 기준 대칭이다. 어긋나면 기하가 틀린 것이다.
    const doc = dice({ speckle: 0, pips: [1, 1, 1] })
    for (let y = 0; y < doc.h; y++) {
      for (let x = 0; x < doc.w; x++) {
        expect(getPixel(doc, x, y)[3]).toBe(getPixel(doc, doc.w - 1 - x, y)[3])
      }
    }
  })

  it('눈 개수를 늘리면 눈 픽셀이 늘어난다', () => {
    const pipPixels = (n: number) => {
      const doc = dice({ speckle: 0, pips: [n, 1, 1], material: 'stone' })
      // 눈은 가장 어두운 축에 속한다. 외곽선과 구분하려고 안쪽만 센다.
      let dark = 0
      for (let y = 4; y < doc.h - 4; y++) {
        for (let x = 4; x < doc.w - 4; x++) {
          const [r, g, b, a] = getPixel(doc, x, y)
          if (a !== 0 && (r + g + b) / 3 < 60) dark++
        }
      }
      return dark
    }
    expect(pipPixels(6)).toBeGreaterThan(pipPixels(1))
  })

  it('재질마다 팔레트가 다르다', () => {
    const seen = new Set(
      (['stone', 'metal', 'wood', 'gem'] as DiceMaterial[]).map((material) =>
        dice({ material, speckle: 0 }).data.join(','),
      ),
    )
    expect(seen.size).toBe(4)
  })

  it('색조를 바꾸면 색만 달라지고 형태는 같다', () => {
    // 색 교체 기반이라는 것이 이 생성기의 요점이다.
    const a = dice({ hue: 110, speckle: 0 })
    const b = dice({ hue: 350, speckle: 0 })
    for (let i = 3; i < a.data.length; i += 4) {
      expect(a.data[i]).toBe(b.data[i])
    }
    expect(a.data.join(',')).not.toBe(b.data.join(','))
  })

  it('작은 크기에서도 형태가 나온다', () => {
    for (const size of [16, 24, 48, 64]) {
      const doc = dice({ size })
      expect(doc.w).toBe(size)
      expect(opaqueCount(doc)).toBeGreaterThan(0)
      expect(isConnected(doc)).toBe(true)
    }
  })

  it('spec으로 저장할 수 있다', () => {
    expect(() => toSpec(dice())).not.toThrow()
  })

  it('가장자리를 비워 외곽선이 잘리지 않는다', () => {
    const doc = dice()
    for (let x = 0; x < doc.w; x++) {
      expect(getPixel(doc, x, 0)[3]).toBe(0)
      expect(getPixel(doc, x, doc.h - 1)[3]).toBe(0)
    }
  })
})

describe('randomPips', () => {
  it('같은 시드면 같은 눈이 나온다', () => {
    expect(randomPips(42)).toEqual(randomPips(42))
  })

  it('실제 주사위 규칙을 지킨다', () => {
    // 마주보는 면의 합은 7이다. 보이는 세 면은 (1,6) (2,5) (3,4) 에서
    // 하나씩이므로 중복도, 합이 7인 짝도 나올 수 없다.
    for (let seed = 0; seed < 200; seed++) {
      const pips = randomPips(seed)
      expect(new Set(pips).size).toBe(3)
      for (const [a, b] of [
        [pips[0], pips[1]],
        [pips[0], pips[2]],
        [pips[1], pips[2]],
      ]) {
        expect(a + b).not.toBe(7)
      }
      for (const p of pips) expect(p).toBeGreaterThanOrEqual(1)
      for (const p of pips) expect(p).toBeLessThanOrEqual(6)
    }
  })

  it('위면이 한쪽으로 쏠리지 않는다', () => {
    const tops = new Set(Array.from({ length: 60 }, (_, i) => randomPips(i)[0]))
    expect(tops.size).toBeGreaterThan(2)
  })
})
