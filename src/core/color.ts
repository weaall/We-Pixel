/** RGBA 채널, 각 0-255. */
export type RGBA = readonly [number, number, number, number]

export const TRANSPARENT: RGBA = [0, 0, 0, 0]

/** "#rgb" | "#rrggbb" | "#rrggbbaa" 를 RGBA로. 파싱 실패 시 null. */
export function parseHex(hex: string): RGBA | null {
  const s = hex.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]+$/.test(s)) return null
  const n = (i: number) => parseInt(s.slice(i, i + 2), 16)
  switch (s.length) {
    case 3:
      return [
        parseInt(s[0] + s[0], 16),
        parseInt(s[1] + s[1], 16),
        parseInt(s[2] + s[2], 16),
        255,
      ]
    case 6:
      return [n(0), n(2), n(4), 255]
    case 8:
      return [n(0), n(2), n(4), n(6)]
    default:
      return null
  }
}

const hex2 = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')

/** alpha가 255면 "#rrggbb", 아니면 "#rrggbbaa". */
export function toHex(c: RGBA): string {
  const base = `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}`
  return c[3] === 255 ? base : base + hex2(c[3])
}

/** 알파를 무시한 "#rrggbb" — <input type="color"> 용. */
export function toHexRGB(c: RGBA): string {
  return `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}`
}

export function equals(a: RGBA, b: RGBA): boolean {
  // 둘 다 완전 투명이면 RGB가 달라도 같은 픽셀로 취급한다.
  if (a[3] === 0 && b[3] === 0) return true
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]
}

/** HSL(h: 0-360, s/l: 0-1) -> RGBA. 생성 알고리즘의 팔레트 램프용. */
export function fromHsl(h: number, s: number, l: number, a = 255): RGBA {
  const hp = (((h % 360) + 360) % 360) / 60
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255, a]
}

/** RGBA -> HSL(h: 0-360, s/l: 0-1). 알파는 버린다. */
export function toHsl(c: RGBA): { h: number; s: number; l: number } {
  const r = c[0] / 255
  const g = c[1] / 255
  const b = c[2] / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  // 무채색은 색조가 정의되지 않는다. 0으로 두면 빨강 쪽으로 끌려가므로 s로 걸러 쓴다.
  if (d === 0) return { h: 0, s: 0, l }

  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return { h: ((h * 60) % 360 + 360) % 360, s, l }
}
