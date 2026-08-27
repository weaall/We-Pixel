// 생성된 파일입니다. 손으로 고치지 마세요.
// npx tsx tools/build-buttons.mts frames/button.png
//
// 사람이 그린 참고 버튼에서 뜬 형태입니다. 9-슬라이스라 가운데를 늘려 어떤
// 크기든 만듭니다 — 32/64/96 을 따로 들고 갈 필요가 없습니다.

export const BUTTON_SIZE = { w: 32, h: 32 } as const

/** 늘리지 않고 그대로 두는 가장자리 폭. 유니티의 spriteBorder 와 같은 뜻입니다. */
export const BUTTON_BORDER = {"left":5,"right":5,"top":5,"bottom":5} as const

/** 문자 -> "#rrggbb" | "transparent". */
export const BUTTON_PALETTE: Record<string, string> = {
  "a": "#ffffff",
  "b": "#000000",
  "c": "#c9dcf3",
  "d": "#364353",
  "e": "#566c86",
  ".": "transparent"
}

/**
 * 각 문자가 무엇인지.
 *
 * halo        바깥 테두리 (투명과 맞닿는 한 겹)
 * outline     외곽선
 * bevelLit    왼쪽 위 경사 (빛을 받는 쪽)
 * face        본체
 * bevelShade  오른쪽 아래 경사 (그늘)
 */
export type ButtonRole = 'halo' | 'outline' | 'bevelLit' | 'face' | 'bevelShade'

export const BUTTON_ROLE_OF: Record<string, ButtonRole> = {
  "a": "halo",
  "b": "outline",
  "e": "face",
  "d": "bevelShade",
  "c": "bevelLit"
}

/** 접지 않은 행. 가로세로로 늘려 쓰는 원본입니다. */
export const BUTTON_ROWS: string[] = [
  '...aaaaaaaaaaaaaaaaaaaaaaaaaa...',
  '..abbbbbbbbbbbbbbbbbbbbbbbbbba..',
  '.abccccccccccccccccccccccccddba.',
  'abccceeeeeeeeeeeeeeeeeeeeeeeddba',
  'abcceeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abceeeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abceeeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abceeeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abceeeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abceeeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abceeeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abceeeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abceeeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abceeeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abceeeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abceeeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abceeeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abceeeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abceeeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abceeeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abceeeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abceeeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abceeeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abceeeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abceeeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abceeeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abceeeeeeeeeeeeeeeeeeeeeeeeeedba',
  'abdeeeeeeeeeeeeeeeeeeeeeeeeeddba',
  'abddeeeeeeeeeeeeeeeeeeeeeeedddba',
  '.abddddddddddddddddddddddddddba.',
  '..abbbbbbbbbbbbbbbbbbbbbbbbbba..',
  '...aaaaaaaaaaaaaaaaaaaaaaaaaa...',
]
