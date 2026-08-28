// 생성된 파일입니다. 손으로 고치지 마세요.
// npx tsx tools/build-item.mts frames/item.png
//
// 사람이 그린 참고 아이템 칸에서 뜬 형태입니다. 등급은 색조만 옮겨 만듭니다.

export const ITEM_SIZE = { w: 32, h: 32 } as const

/** 문자 -> "#rrggbb" | "transparent". */
export const ITEM_PALETTE: Record<string, string> = {
  "a": "#f6c43b",
  "b": "#0e0b0d",
  "c": "#eb9435",
  "d": "#1a1417",
  "e": "#2a1f25",
  "f": "#3d3027",
  "g": "#4d3724",
  "h": "#543e27",
  "i": "#5e4326",
  ".": "transparent"
}

/**
 * 각 문자가 무엇인지.
 *
 * frameLit    위쪽 테두리 (빛을 받는 쪽)
 * frameShade  아래쪽 테두리
 * fill0..N    속을 채우는 세로 그라데이션. 0 이 가장 위입니다.
 */
export const ITEM_ROLE_OF: Record<string, string> = {
  "a": "frameLit",
  "c": "frameShade",
  "b": "fill0",
  "d": "fill1",
  "e": "fill2",
  "f": "fill3",
  "g": "fill4",
  "h": "fill5",
  "i": "fill6"
}

/** 그라데이션 단 수. */
export const ITEM_FILL_STEPS = 7

/** 접지 않은 행. */
export const ITEM_ROWS: string[] = [
  '..aaaaaaaaaaaaaaaaaaaaaaaaaaaa..',
  '.aabbbbbbbbbbbbbbbbbbbbbbbbbbac.',
  'aabbbbbbbbbbbbbbbbbbbbbbbbbbbbcc',
  'abbbbbbbbbbbbbbbbbbbbbbbbbbbbbbc',
  'abbbbbbbbbbbbbbbbbbbbbbbbbbbbbbc',
  'abbbbbbbbbbbbbbbbbbbbbbbbbbbbbbc',
  'abbbbbbbbbbbbbbbbbbbbbbbbbbbbbbc',
  'addddddddddddddddddddddddddddddc',
  'addddddddddddddddddddddddddddddc',
  'addddddddddddddddddddddddddddddc',
  'addddddddddddddddddddddddddddddc',
  'aeeeeeeeeeeeeeeeeeeeeeeeeeeeeeec',
  'aeeeeeeeeeeeeeeeeeeeeeeeeeeeeeec',
  'aeeeeeeeeeeeeeeeeeeeeeeeeeeeeeec',
  'aeeeeeeeeeeeeeeeeeeeeeeeeeeeeeec',
  'affffffffffffffffffffffffffffffc',
  'affffffffffffffffffffffffffffffc',
  'affffffffffffffffffffffffffffffc',
  'affffffffffffffffffffffffffffffc',
  'aggggggggggggggggggggggggggggggc',
  'aggggggggggggggggggggggggggggggc',
  'aggggggggggggggggggggggggggggggc',
  'aggggggggggggggggggggggggggggggc',
  'ahhhhhhhhhhhhhhhhhhhhhhhhhhhhhhc',
  'ahhhhhhhhhhhhhhhhhhhhhhhhhhhhhhc',
  'ahhhhhhhhhhhhhhhhhhhhhhhhhhhhhhc',
  'ahhhhhhhhhhhhhhhhhhhhhhhhhhhhhhc',
  'aiiiiiiiiiiiiiiiiiiiiiiiiiiiiiic',
  'aiiiiiiiiiiiiiiiiiiiiiiiiiiiiiic',
  'aaiiiiiiiiiiiiiiiiiiiiiiiiiiiicc',
  '.cciiiiiiiiiiiiiiiiiiiiiiiiiicc.',
  '..cccccccccccccccccccccccccccc..',
]
