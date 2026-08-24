import type { RGBA } from './color'
import { parseHex, toHex } from './color'
import type { PixelDoc } from './doc'
import { createDoc, setPixel } from './doc'

/**
 * 팔레트 + 인덱스 그리드 포맷.
 *
 * 32x32를 hex 배열로 표현하면 1024개 항목이 되어 LLM이 형태를 유지하지 못한다.
 * 행 단위 문자열로 두면 토큰이 1/10 수준으로 줄고, 모델이 그림을 "보면서" 생성할 수 있다.
 * 이 포맷이 AI 생성 단계의 계약이 된다.
 */
export interface PixelSpec {
  w: number
  h: number
  /** 문자 -> "#rrggbb" | "#rrggbbaa" | "transparent" */
  palette: Record<string, string>
  /** 길이 h의 배열, 각 문자열 길이 w. */
  rows: string[]
}

export const TRANSPARENT_CHAR = '.'

const ALPHABET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-*/=<>!?@#$%&'

export const MAX_SPEC_COLORS = ALPHABET.length

export class TooManyColorsError extends Error {
  constructor(readonly count: number) {
    super(`색상이 ${count}종류로 spec 포맷 한계(${MAX_SPEC_COLORS})를 넘습니다`)
    this.name = 'TooManyColorsError'
  }
}

/** 문서를 spec으로 변환. 색상 종류가 한계를 넘으면 TooManyColorsError. */
export function toSpec(doc: PixelDoc): PixelSpec {
  const charOf = new Map<string, string>()
  const palette: Record<string, string> = {}
  const rows: string[] = []

  for (let y = 0; y < doc.h; y++) {
    let row = ''
    for (let x = 0; x < doc.w; x++) {
      const i = (y * doc.w + x) * 4
      if (doc.data[i + 3] === 0) {
        row += TRANSPARENT_CHAR
        continue
      }
      const c: RGBA = [doc.data[i], doc.data[i + 1], doc.data[i + 2], doc.data[i + 3]]
      const hex = toHex(c)
      let ch = charOf.get(hex)
      if (ch === undefined) {
        if (charOf.size >= MAX_SPEC_COLORS) throw new TooManyColorsError(charOf.size + 1)
        ch = ALPHABET[charOf.size]
        charOf.set(hex, ch)
        palette[ch] = hex
      }
      row += ch
    }
    rows.push(row)
  }

  if (rows.some((r) => r.includes(TRANSPARENT_CHAR))) {
    palette[TRANSPARENT_CHAR] = 'transparent'
  }
  return { w: doc.w, h: doc.h, palette, rows }
}

/** spec을 문서로 복원. 형식이 어긋나면 Error. */
export function fromSpec(spec: PixelSpec): PixelDoc {
  if (!Number.isInteger(spec.w) || !Number.isInteger(spec.h) || spec.w < 1 || spec.h < 1) {
    throw new Error(`잘못된 크기: ${spec.w}x${spec.h}`)
  }
  if (spec.rows.length !== spec.h) {
    throw new Error(`rows 길이가 ${spec.rows.length}인데 h는 ${spec.h}입니다`)
  }

  const resolved = new Map<string, RGBA>()
  for (const [ch, value] of Object.entries(spec.palette)) {
    if (value === 'transparent' || value === 'none') {
      resolved.set(ch, [0, 0, 0, 0])
      continue
    }
    const rgba = parseHex(value)
    if (!rgba) throw new Error(`팔레트 '${ch}'의 값 "${value}"을 해석할 수 없습니다`)
    resolved.set(ch, rgba)
  }
  resolved.set(TRANSPARENT_CHAR, resolved.get(TRANSPARENT_CHAR) ?? [0, 0, 0, 0])

  const doc = createDoc(spec.w, spec.h)
  for (let y = 0; y < spec.h; y++) {
    const row = spec.rows[y]
    if (row.length !== spec.w) {
      throw new Error(`${y}번 행의 길이가 ${row.length}인데 w는 ${spec.w}입니다`)
    }
    for (let x = 0; x < spec.w; x++) {
      const c = resolved.get(row[x])
      if (!c) throw new Error(`${y}번 행의 문자 '${row[x]}'가 팔레트에 없습니다`)
      setPixel(doc, x, y, c)
    }
  }
  return doc
}

/** 문서에 실제로 쓰인 색을 사용 빈도 순으로. 팔레트 패널의 "사용 중 색상"용. */
export function usedColors(doc: PixelDoc): Array<{ hex: string; count: number }> {
  const counts = new Map<string, number>()
  for (let i = 0; i < doc.data.length; i += 4) {
    if (doc.data[i + 3] === 0) continue
    const hex = toHex([doc.data[i], doc.data[i + 1], doc.data[i + 2], doc.data[i + 3]])
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count)
}
