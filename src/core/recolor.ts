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
export function replaceColor(
  doc: PixelDoc,
  from: RGBA,
  to: RGBA,
  tolerance = 0,
): ReplaceResult {
  const next: PixelDoc = { w: doc.w, h: doc.h, data: new Uint8ClampedArray(doc.data) }
  let changed = 0

  for (let i = 0; i < next.data.length; i += 4) {
    if (!matchesAt(doc, i, from, tolerance)) continue
    next.data[i] = to[0]
    next.data[i + 1] = to[1]
    next.data[i + 2] = to[2]
    next.data[i + 3] = to[3]
    changed++
  }

  return { doc: next, changed }
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
