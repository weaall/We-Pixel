import { describe, expect, it } from 'vitest'
import { fitRow, MAX_MODEL_SIZE, planGeneration, repairSpec, upscaleRows } from '../server/gemini'

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
