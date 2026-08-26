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

/**
 * 반복을 접는 표기의 구분자. ALPHABET 에도 TRANSPARENT_CHAR 에도 없는 글자여야
 * 팔레트 문자와 헷갈리지 않는다.
 */
const RUN = '~'

/**
 * 3개까지는 접어도 짧아지지 않는다. "eee" 와 "e~3" 은 둘 다 3자다.
 */
const MIN_RUN = 4

/**
 * 숫자가 팔레트 문자로 쓰이면 개수와 구분할 수 없다.
 *
 * toSpec 은 알파벳 52자를 먼저 쓰므로 색이 53종을 넘어야 숫자가 나온다.
 * 픽셀 아트에서 실제로 일어나는 일은 아니지만, 일어나면 조용히 틀리는 대신
 * 접기를 포기해야 한다.
 */
export function canPackRows(palette: Record<string, string>): boolean {
  return !Object.keys(palette).some((ch) => /[0-9~]/.test(ch))
}

/**
 * 한 행의 반복을 접는다. "..........aab" -> ".~10aab"
 *
 * 토큰만 줄이는 것이 아니다. LLM 은 글자를 세지 못한다 — 같은 글자를 28번
 * 적으라고 하면 27번이나 29번을 적는다. 개수를 숫자로 적게 하면 셀 일이 없고,
 * 펼칠 때 합이 w 와 맞는지 확인할 수 있어 틀린 줄이 조용히 지나가지 않는다.
 */
export function packRow(row: string): string {
  let out = ''
  for (let i = 0; i < row.length; ) {
    let j = i
    while (j < row.length && row[j] === row[i]) j++
    const n = j - i
    out += n >= MIN_RUN ? `${row[i]}${RUN}${n}` : row[i].repeat(n)
    i = j
  }
  return out
}

/** 접힌 행을 펼친다. 길이가 w 와 다르면 Error — 여기서 잡아야 그림이 밀리지 않는다. */
export function unpackRow(packed: string, w: number): string {
  let out = ''
  for (let i = 0; i < packed.length; ) {
    const ch = packed[i]
    if (ch === RUN) throw new Error(`${RUN} 앞에 문자가 없습니다: "${packed}"`)
    i++
    if (packed[i] === RUN) {
      i++
      let digits = ''
      while (i < packed.length && packed[i] >= '0' && packed[i] <= '9') digits += packed[i++]
      if (digits === '') throw new Error(`${RUN} 뒤에 개수가 없습니다: "${packed}"`)
      const n = Number(digits)
      // 여기서 막지 않으면 잘못된 개수 하나가 메모리를 통째로 먹는다.
      if (out.length + n > w) {
        throw new Error(`행이 w(${w})를 넘습니다: "${packed}"`)
      }
      out += ch.repeat(n)
    } else {
      out += ch
    }
  }
  if (out.length !== w) {
    throw new Error(`행 길이가 ${out.length}인데 w는 ${w}입니다: "${packed}"`)
  }
  return out
}

export function packRows(spec: PixelSpec): string[] {
  if (!canPackRows(spec.palette)) throw new Error('팔레트가 숫자를 써서 접을 수 없습니다')
  return spec.rows.map(packRow)
}

export function unpackRows(packed: ReadonlyArray<string>, w: number): string[] {
  return packed.map((row, i) => {
    try {
      return unpackRow(row, w)
    } catch (err) {
      throw new Error(`${i}번 행: ${err instanceof Error ? err.message : String(err)}`)
    }
  })
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
