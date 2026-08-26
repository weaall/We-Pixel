import { describe, expect, it } from 'vitest'
import {
  buildRecolorMappings,
  fitRow,
  MAX_MODEL_SIZE,
  overlay,
  REDRAW_RATIO,
  planGeneration,
  planRecolor,
  repairSpec,
  toSpecSafe,
  upscaleRows,
} from '../server/gemini'
import { createDoc, getPixel, setPixel } from '../src/core/doc'
import { replaceColors } from '../src/core/recolor'
import { findRowProblems } from '../server/llm'
import type { RGBA } from '../src/core/color'

describe('fitRow', () => {
  it('맞는 길이는 건드리지 않는다', () => {
    expect(fitRow('abcd', 4)).toBe('abcd')
  })

  it('짧으면 양쪽에서 고르게 채운다', () => {
    // 끝에만 채우면 그림이 왼쪽으로 밀린다. 스프라이트는 가운데 정렬이다.
    expect(fitRow('ab', 6)).toBe('..ab..')
    expect(fitRow('abc', 6)).toBe('.abc..')
  })

  it('길면 양쪽에서 고르게 자른다', () => {
    expect(fitRow('xxabxx', 2)).toBe('ab')
    expect(fitRow('xabx', 2)).toBe('ab')
  })

  it('가운데 정렬을 유지한다', () => {
    // 대칭인 행은 보정 후에도 대칭이어야 한다.
    const fixed = fitRow('.kk.', 8)
    expect(fixed).toBe([...fixed].reverse().join(''))
  })
})

describe('upscaleRows', () => {
  it('정수배로 문자를 복제한다', () => {
    expect(upscaleRows(['ab'], 2)).toEqual(['aabb', 'aabb'])
  })

  it('1배는 그대로 둔다', () => {
    const rows = ['ab', 'cd']
    expect(upscaleRows(rows, 1)).toBe(rows)
  })

  it('색을 늘리지 않는다', () => {
    // 문자를 복제할 뿐이므로 팔레트 한도에 걸릴 일이 없다.
    const before = new Set([...'abcd'])
    const after = new Set(upscaleRows(['abcd'], 4).join(''))
    expect(after).toEqual(before)
  })

  it('크기가 정확히 배수가 된다', () => {
    const out = upscaleRows(['abc', 'def'], 3)
    expect(out.length).toBe(6)
    expect(out.every((r) => r.length === 9)).toBe(true)
  })
})

describe('planGeneration', () => {
  it('모델 한도 이하는 그대로 그리게 한다', () => {
    expect(planGeneration(32, 32)).toEqual({ genW: 32, genH: 32, factor: 1 })
    expect(planGeneration(16, 16).factor).toBe(1)
  })

  it('큰 캔버스는 작게 그리고 키운다', () => {
    expect(planGeneration(64, 64)).toEqual({ genW: 32, genH: 32, factor: 2 })
    expect(planGeneration(256, 256)).toEqual({ genW: 32, genH: 32, factor: 8 })
  })

  it('생성 크기가 모델 한도를 넘지 않는다', () => {
    for (let size = 8; size <= 256; size++) {
      const { genW, genH } = planGeneration(size, size)
      expect(genW).toBeLessThanOrEqual(MAX_MODEL_SIZE)
      expect(genH).toBeLessThanOrEqual(MAX_MODEL_SIZE)
    }
  })

  it('가로세로 비율을 유지한다', () => {
    const { genW, genH } = planGeneration(128, 64)
    expect(genW / genH).toBeCloseTo(2, 1)
  })
})

describe('repairSpec', () => {
  const palette = [
    { char: 'k', hex: '#000000' },
    { char: 'r', hex: '#ff0000' },
  ]

  it('행 길이를 가운데 기준으로 맞춘다', () => {
    const out = repairSpec({ palette, rows: ['kk', 'krrk', 'kk'] }, 4, 3)
    expect(out.rows).toEqual(['.kk.', 'krrk', '.kk.'])
    expect(out.warnings.some((warning) => warning.includes('길이'))).toBe(true)
  })

  it('행 수가 모자라면 채운다', () => {
    const out = repairSpec({ palette, rows: ['kkkk'] }, 4, 3)
    expect(out.rows.length).toBe(3)
    expect(out.warnings.some((warning) => warning.includes('행 수'))).toBe(true)
  })

  it('팔레트에 없는 글자를 투명으로 떨어뜨린다', () => {
    const out = repairSpec({ palette, rows: ['kZrk'] }, 4, 1)
    expect(out.rows[0]).toBe('k.rk')
    expect(out.warnings.some((warning) => warning.includes('팔레트에 없는'))).toBe(true)
  })

  it('투명 문자는 항상 팔레트에 있다', () => {
    expect(repairSpec({ palette, rows: ['kkkk'] }, 4, 1).palette['.']).toBe('transparent')
  })

  it('쓸 수 있는 색이 없으면 던진다', () => {
    // 조용히 투명한 그림을 돌려주면 원인을 알 수 없다.
    expect(() => repairSpec({ palette: [], rows: ['....'] }, 4, 1)).toThrow()
  })

  it('보정할 것이 없으면 경고도 없다', () => {
    expect(repairSpec({ palette, rows: ['krrk'] }, 4, 1).warnings).toEqual([])
  })
})

describe('overlay (덧붙이기)', () => {
  const RED: RGBA = [255, 0, 0, 255]
  const BLUE: RGBA = [0, 0, 255, 255]

  it('behind: 원본이 있는 자리는 절대 바뀌지 않는다', () => {
    const base = createDoc(3, 1)
    setPixel(base, 0, 0, RED)

    const addition = createDoc(3, 1)
    setPixel(addition, 0, 0, BLUE) // 원본 자리를 덮으려는 시도
    setPixel(addition, 1, 0, BLUE)

    const out = overlay(base, addition, 'behind')
    expect(getPixel(out.doc, 0, 0)).toEqual(RED)
    expect(getPixel(out.doc, 1, 0)).toEqual(BLUE)
    expect(out.added).toBe(1)
    expect(out.covered).toBe(0)
  })

  it('behind: 원본을 통째로 덮어써도 원본이 이긴다', () => {
    const base = createDoc(4, 4)
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) setPixel(base, x, y, RED)
    const addition = createDoc(4, 4)
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) setPixel(addition, x, y, BLUE)

    expect(Array.from(overlay(base, addition, 'behind').doc.data)).toEqual(Array.from(base.data))
  })

  it('front: 그린 자리는 덮고 투명한 자리는 원본을 남긴다', () => {
    // 모자가 머리를 가려야 하는 경우. behind 로는 표현할 수 없다.
    const base = createDoc(3, 1)
    setPixel(base, 0, 0, RED)
    setPixel(base, 1, 0, RED)

    const addition = createDoc(3, 1)
    setPixel(addition, 0, 0, BLUE) // 원본을 가린다

    const out = overlay(base, addition, 'front')
    expect(getPixel(out.doc, 0, 0)).toEqual(BLUE)
    expect(getPixel(out.doc, 1, 0)).toEqual(RED) // 모델이 투명으로 둔 자리
    expect(out.covered).toBe(1)
  })

  it('front: 덮은 비율을 보고해 덮어쓰기를 판별할 수 있다', () => {
    const base = createDoc(4, 4)
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) setPixel(base, x, y, RED)
    const addition = createDoc(4, 4)
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) setPixel(addition, x, y, BLUE)

    const out = overlay(base, addition, 'front')
    expect(out.covered / out.baseOpaque).toBe(1)
    expect(out.covered / out.baseOpaque).toBeGreaterThan(REDRAW_RATIO)
  })

  it('front: 살짝 겹치는 것은 덮어쓰기로 보지 않는다', () => {
    const base = createDoc(10, 1)
    for (let x = 0; x < 10; x++) setPixel(base, x, 0, RED)
    const addition = createDoc(10, 1)
    setPixel(addition, 0, 0, BLUE)
    setPixel(addition, 1, 0, BLUE)

    const out = overlay(base, addition, 'front')
    expect(out.covered / out.baseOpaque).toBeLessThan(REDRAW_RATIO)
  })

  it('빈 캔버스에는 두 모드 모두 전부 들어간다', () => {
    const addition = createDoc(2, 1)
    setPixel(addition, 0, 0, BLUE)
    for (const mode of ['front', 'behind'] as const) {
      expect(getPixel(overlay(createDoc(2, 1), addition, mode).doc, 0, 0)).toEqual(BLUE)
    }
  })

  it('원본을 훼손하지 않는다', () => {
    const base = createDoc(2, 1)
    setPixel(base, 0, 0, RED)
    const addition = createDoc(2, 1)
    setPixel(addition, 0, 0, BLUE)
    overlay(base, addition, 'front')
    expect(getPixel(base, 0, 0)).toEqual(RED)
  })

  it('기본값은 behind 다', () => {
    const base = createDoc(1, 1)
    setPixel(base, 0, 0, RED)
    const addition = createDoc(1, 1)
    setPixel(addition, 0, 0, BLUE)
    expect(getPixel(overlay(base, addition).doc, 0, 0)).toEqual(RED)
  })
})

describe('toSpecSafe', () => {
  it('색이 적으면 그대로 돌려준다', () => {
    const doc = createDoc(2, 1)
    setPixel(doc, 0, 0, [255, 0, 0, 255])
    const out = toSpecSafe(doc)
    expect(out.reduced).toBe(false)
  })

  it('색이 한도를 넘으면 줄여서라도 돌려준다', () => {
    // 여기서 던지면 병합 결과를 통째로 잃는다.
    const doc = createDoc(16, 16)
    for (let i = 0; i < 256; i++) {
      setPixel(doc, i % 16, Math.floor(i / 16), [i, (i * 7) % 256, (i * 13) % 256, 255])
    }
    const out = toSpecSafe(doc)
    expect(out.reduced).toBe(true)
    expect(Object.keys(out.spec.palette).length).toBeLessThanOrEqual(60)
  })
})

describe('색만 바꾸기 (팔레트 교체)', () => {
  const BODY: RGBA = [60, 120, 60, 255]
  const PIP: RGBA = [200, 40, 40, 255]

  /** 몸통 위에 눈이 찍힌 작은 주사위. */
  function dice(): ReturnType<typeof createDoc> {
    const doc = createDoc(4, 4)
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) setPixel(doc, x, y, BODY)
    setPixel(doc, 1, 1, PIP)
    setPixel(doc, 2, 2, PIP)
    return doc
  }

  it('많이 쓰인 색부터 목록을 만든다', () => {
    const plan = planRecolor(dice())
    expect(plan.hexes[0]).toBe('#3c783c') // 몸통이 14px 로 가장 많다
    expect(plan.hexes).toContain('#c82828')
    expect(plan.chars.length).toBe(2)
  })

  it('모델 응답을 매핑으로 바꾼다', () => {
    const plan = planRecolor(dice())
    const { mappings, changed, skipped } = buildRecolorMappings(plan, [
      { char: plan.chars[0], hex: '#803030' },
      { char: plan.chars[1], hex: '#ffe0a0' },
    ])
    expect(changed).toBe(2)
    expect(skipped).toBe(0)
    expect(mappings.length).toBe(2)
  })

  it('색을 바꿔도 모양이 한 픽셀도 바뀌지 않는다', () => {
    // 이것이 이 모드의 존재 이유다. 모델이 그리드를 만지지 않으므로
    // 불투명/투명 배치가 그대로여야 한다.
    const doc = dice()
    const plan = planRecolor(doc)
    const { mappings } = buildRecolorMappings(plan, [
      { char: plan.chars[0], hex: '#803030' },
      { char: plan.chars[1], hex: '#ffe0a0' },
    ])
    const out = replaceColors(doc, mappings, 0).doc

    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        // 알파(형태)는 동일, 색만 다르다
        expect(getPixel(out, x, y)[3]).toBe(getPixel(doc, x, y)[3])
      }
    }
    // 눈이 있던 자리는 여전히 몸통과 다른 색이다
    expect(getPixel(out, 1, 1)).not.toEqual(getPixel(out, 0, 0))
    expect(getPixel(out, 1, 1)).toEqual([255, 224, 160, 255])
  })

  it('모델이 빠뜨린 색은 원래 값을 지킨다', () => {
    // 빠진 색을 검정이나 투명으로 만들면 그림이 망가진다.
    const plan = planRecolor(dice())
    const { mappings, changed, skipped } = buildRecolorMappings(plan, [
      { char: plan.chars[0], hex: '#803030' },
    ])
    expect(changed).toBe(1)
    expect(skipped).toBe(1)
    expect(mappings.length).toBe(1)
  })

  it('형식이 틀린 hex는 무시한다', () => {
    const plan = planRecolor(dice())
    const { changed, skipped } = buildRecolorMappings(plan, [
      { char: plan.chars[0], hex: 'red' },
      { char: plan.chars[1], hex: '#12345' },
    ])
    expect(changed).toBe(0)
    expect(skipped).toBe(2)
  })

  it('같은 색을 돌려주면 매핑에 넣지 않는다', () => {
    const plan = planRecolor(dice())
    const { changed } = buildRecolorMappings(plan, [
      { char: plan.chars[0], hex: plan.hexes[0] },
      { char: plan.chars[1], hex: plan.hexes[1] },
    ])
    expect(changed).toBe(0)
  })

  it('모르는 char는 버린다', () => {
    const plan = planRecolor(dice())
    const { changed, skipped } = buildRecolorMappings(plan, [{ char: 'Z', hex: '#123456' }])
    expect(changed).toBe(0)
    expect(skipped).toBe(2)
  })
})

describe('행 형식 검증 (재요청 판단)', () => {
  it('정상이면 문제 없음', () => {
    expect(findRowProblems(['abcd', 'abcd'], 4, 2)).toEqual([])
  })

  it('길이가 틀린 행을 집어낸다', () => {
    const problems = findRowProblems(['abcd', 'abc', 'abcde'], 4, 3)
    expect(problems).toEqual([
      { index: 1, length: 3 },
      { index: 2, length: 5 },
    ])
  })

  it('행 수가 틀리면 index -1 로 보고한다', () => {
    const problems = findRowProblems(['abcd'], 4, 3)
    expect(problems).toContainEqual({ index: -1, length: 1 })
  })

  it('길이와 개수를 함께 보고한다', () => {
    const problems = findRowProblems(['abc', 'abcd'], 4, 3)
    expect(problems.filter((p) => p.index !== -1).length).toBe(1)
    expect(problems.some((p) => p.index === -1)).toBe(true)
  })
})
