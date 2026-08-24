/** 시드 기반 2D 펄린 노이즈. 출력 범위는 대략 [-1, 1]. */
export class Perlin {
  private readonly perm = new Uint16Array(512)

  constructor(rand: () => number) {
    const p = new Uint8Array(256)
    for (let i = 0; i < 256; i++) p[i] = i
    // Fisher-Yates
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      const tmp = p[i]
      p[i] = p[j]
      p[j] = tmp
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]
  }

  noise(x: number, y: number): number {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const X = xi & 255
    const Y = yi & 255
    const xf = x - xi
    const yf = y - yi
    const u = fade(xf)
    const v = fade(yf)

    const aa = this.perm[this.perm[X] + Y]
    const ab = this.perm[this.perm[X] + Y + 1]
    const ba = this.perm[this.perm[X + 1] + Y]
    const bb = this.perm[this.perm[X + 1] + Y + 1]

    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u)
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u)
    return lerp(x1, x2, v)
  }

  /** [0, 1]로 정규화한 값. */
  noise01(x: number, y: number): number {
    return Math.min(1, Math.max(0, this.noise(x, y) * 0.5 + 0.5))
  }

  /** 옥타브를 겹친 fBm. 지형처럼 디테일이 필요할 때. */
  fbm(x: number, y: number, octaves: number, persistence = 0.5): number {
    let total = 0
    let amp = 1
    let freq = 1
    let max = 0
    for (let i = 0; i < octaves; i++) {
      total += this.noise(x * freq, y * freq) * amp
      max += amp
      amp *= persistence
      freq *= 2
    }
    return total / max
  }
}

const GRADS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

function grad(hash: number, x: number, y: number): number {
  const g = GRADS[hash & 7]
  return g[0] * x + g[1] * y
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
