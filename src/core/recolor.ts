import type { RGBA } from './color'
import type { PixelDoc } from './doc'

export interface ReplaceResult {
  doc: PixelDoc
  /** 실제로 바뀐 픽셀 수. 0이면 대상이 없었다는 뜻이라 UI에서 알려야 한다. */
  changed: number
}

/**
 * 특정 색의 픽셀을 모두 다른 색으로 바꾼다.
 *
 * 투명도 처리가 핵심이다.
 * - from이 투명이면 RGB는 보지 않고 알파만 본다. 투명 픽셀의 RGB는 대개 0,0,0이라
 *   비교에 넣으면 "검정"과 구분되지 않는다.
 * - to가 투명이면 해당 색을 지우는 동작이 된다.
 *
 * tolerance는 0이 기본이다. 픽셀 아트는 색이 정확히 일치하는 것이 정상이고,
 * 느슨하게 잡으면 명암 단계까지 같이 먹어버린다. 사진에서 가져온 그림처럼
 * 비슷한 색이 흩어져 있을 때만 올린다.
 */
export interface ColorMapping {
  from: RGBA
  to: RGBA
}

/**
 * 여러 색을 한 번에 바꾼다.
 *
 * 매핑을 하나씩 순서대로 적용하면 안 된다. A→B 와 B→C 를 함께 지정한 경우,
 * 순차 적용은 원래 A 였던 픽셀까지 C 로 만들어 버린다. 사용자가 지정한 것은
 * "A는 B로, B는 C로"이지 "A는 C로"가 아니다.
 *
 * 그래서 판정은 항상 원본에서 읽고 결과에만 쓴다. 한 픽셀은 최대 한 번 바뀐다.
 */
export function replaceColors(
  doc: PixelDoc,
  mappings: ReadonlyArray<ColorMapping>,
  tolerance = 0,
): ReplaceResult {
  const next: PixelDoc = { w: doc.w, h: doc.h, data: new Uint8ClampedArray(doc.data) }
  let changed = 0

  for (let i = 0; i < next.data.length; i += 4) {
    for (const { from, to } of mappings) {
      // 원본(doc)을 보고 판정한다. next를 보면 앞선 매핑의 결과가 섞인다.
      if (!matchesAt(doc, i, from, tolerance)) continue
      // 같은 색으로 바꾸는 매핑은 바뀐 것으로 세지 않는다.
      if (!sameColor(doc, i, to)) {
        next.data[i] = to[0]
        next.data[i + 1] = to[1]
        next.data[i + 2] = to[2]
        next.data[i + 3] = to[3]
        changed++
      }
      break
    }
  }

  return { doc: next, changed }
}

export function replaceColor(
  doc: PixelDoc,
  from: RGBA,
  to: RGBA,
  tolerance = 0,
): ReplaceResult {
  return replaceColors(doc, [{ from, to }], tolerance)
}

function sameColor(doc: PixelDoc, i: number, c: RGBA): boolean {
  if (doc.data[i + 3] === 0 && c[3] === 0) return true
  return (
    doc.data[i] === c[0] &&
    doc.data[i + 1] === c[1] &&
    doc.data[i + 2] === c[2] &&
    doc.data[i + 3] === c[3]
  )
}

/** 바꾸지 않고 대상 픽셀 수만 센다. 적용 전에 영향 범위를 보여줄 때 쓴다. */
export function countMatches(doc: PixelDoc, from: RGBA, tolerance = 0): number {
  let n = 0
  for (let i = 0; i < doc.data.length; i += 4) {
    if (matchesAt(doc, i, from, tolerance)) n++
  }
  return n
}

function matchesAt(doc: PixelDoc, i: number, from: RGBA, tolerance: number): boolean {
  const alpha = doc.data[i + 3]

  // 투명끼리는 RGB를 보지 않는다.
  if (from[3] === 0) return alpha === 0
  if (alpha === 0) return false

  const dr = doc.data[i] - from[0]
  const dg = doc.data[i + 1] - from[1]
  const db = doc.data[i + 2] - from[2]

  if (tolerance <= 0) {
    return dr === 0 && dg === 0 && db === 0 && alpha === from[3]
  }
  // 제곱 거리로 비교한다. 제곱근은 순서를 바꾸지 않으므로 계산할 이유가 없다.
  return dr * dr + dg * dg + db * db <= tolerance * tolerance
}
