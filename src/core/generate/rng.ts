/** mulberry32 — 시드 하나로 재현 가능한 난수. 같은 시드면 같은 그림이 나온다. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 문자열 시드를 32비트 정수로. 사용자가 "goblin" 같은 시드를 입력할 수 있게. */
export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 시드 문자열이 순수 숫자면 그대로, 아니면 해시. */
export function resolveSeed(input: string): number {
  const trimmed = input.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed) >>> 0
  return hashSeed(trimmed)
}

/** UI의 "다시 뽑기" 버튼용 임의 시드. */
export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0
}
