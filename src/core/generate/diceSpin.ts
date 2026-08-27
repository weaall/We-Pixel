import { fromSpec } from '../codec'
import type { PixelDoc } from '../doc'
import { createDoc } from '../doc'
import type { Vec3 } from './cube3d'
import { renderCube } from './cube3d'
import type { DiceTop } from './diceSet'
import { diceSpec } from './diceSet'
import { bounceAt, frameHeadroom, lift } from './diceRoll'

const TAU = Math.PI * 2
const QUARTER = Math.PI / 2

/**
 * 그 눈이 위로 오는 자세.
 *
 * 면 배정은 cube3d 에 고정되어 있다: +Y=1, -Y=6, +Z=2, -Z=5, +X=3, -X=4.
 * 마주보는 면이 축의 양끝이라 합이 7인 규칙이 저절로 지켜진다.
 */
export function restRotation(top: DiceTop): Vec3 {
  switch (top) {
    case 1:
      return { x: 0, y: 0, z: 0 }
    case 2:
      return { x: -QUARTER, y: 0, z: 0 }
    case 3:
      return { x: 0, y: 0, z: QUARTER }
    case 4:
      return { x: 0, y: 0, z: -QUARTER }
    case 5:
      return { x: QUARTER, y: 0, z: 0 }
    default:
      return { x: Math.PI, y: 0, z: 0 }
  }
}

export interface SpinOptions {
  result: DiceTop
  frames: number
  /** 멈출 때까지 도는 바퀴 수. */
  turns: number
  bounces: number
  height: number
  size: number
  /** 큐브 한 변이 차지할 픽셀. */
  scale: number
  palette?: Record<string, string>
  /**
   * 마지막 칸을 무엇으로 둘지.
   *
   * artwork 면 사람이 그린 원본을 쓴다. 그린 것과 계산한 것은 완전히 같을 수
   * 없으므로 멈춘 칸이 원본이어야 결과가 또렷하다.
   */
  finish: 'render' | 'artwork'
  /** 마지막 몇 칸을 결과로 고정할지. */
  settle: number
}

export const defaultSpinOptions: Omit<SpinOptions, 'result'> = {
  frames: 16,
  turns: 1.5,
  bounces: 3,
  height: 6,
  /**
   * 칸 크기.
   *
   * 원본보다 크다. 큐브를 돌리면 대각선이 앞으로 나와 가로세로보다 길어진다.
   * 64 칸에 원본 크기 그대로 넣고 돌리면 모서리가 잘린다.
   */
  size: 72,
  scale: 30,
  finish: 'artwork',
  settle: 2,
}

export interface SpinFrame {
  /** 이 칸에서 떠 있는 높이. */
  lift: number
  /** 사람이 그린 원본을 쓴 칸인지. */
  artwork: boolean
  doc: PixelDoc
}

/** 끝에서 부드럽게 멈춘다. 일정하게 돌다 뚝 멈추면 튕긴 것처럼 보인다. */
function easeOut(t: number): number {
  const k = 1 - t
  return 1 - k * k * k
}

/**
 * 실제로 회전하는 굴리기를 만든다.
 *
 * 눈만 바꾸는 연출과 달리 큐브를 3D 로 돌려 그린다. 면의 모양과 실루엣이 칸마다
 * 달라진다.
 *
 * 마지막 자세는 결과 눈이 위로 오는 자세와 정확히 같다. 어긋나면 멈춘 칸에서
 * 주사위가 툭 돌아앉는 것이 보인다.
 */
export function makeSpin(o: SpinOptions): SpinFrame[] {
  const frames = Math.max(2, Math.floor(o.frames))
  const settle = Math.min(frames - 1, Math.max(0, Math.floor(o.settle)))
  const rest = restRotation(o.result)
  const room = frameHeadroom()
  const height = Math.min(Math.max(0, Math.floor(o.height)), room.top)

  const out: SpinFrame[] = []
  for (let i = 0; i < frames; i++) {
    const t = i / (frames - 1)
    const y = bounceAt(t, o.bounces, height)
    const settling = i >= frames - settle

    if (settling && o.finish === 'artwork') {
      const art = centerInto(fromSpec(diceSpec(o.result, o.palette)), o.size)
      out.push({ lift: y, artwork: true, doc: lift(art, y) })
      continue
    }

    // 남은 회전량. t=1 에서 0이 되어 자세가 정확히 rest 와 같아진다.
    const left = 1 - easeOut(settling ? 1 : t / Math.max(1e-6, (frames - 1 - settle) / (frames - 1)))
    const spin = Math.max(0, left)
    const doc = renderCube({
      size: o.size,
      scale: o.scale,
      palette: o.palette,
      rot: {
        x: rest.x + TAU * o.turns * 0.5 * spin,
        y: rest.y + TAU * o.turns * spin,
        z: rest.z,
      },
    })
    out.push({ lift: y, artwork: false, doc: lift(doc, y) })
  }
  return out
}

/** 그림을 더 큰 칸 가운데에 놓는다. 칸 크기가 섞이면 시트 슬라이스가 어긋난다. */
export function centerInto(doc: PixelDoc, size: number): PixelDoc {
  if (doc.w === size && doc.h === size) {
    return { w: doc.w, h: doc.h, data: new Uint8ClampedArray(doc.data) }
  }
  const out = createDoc(size, size)
  const ox = Math.floor((size - doc.w) / 2)
  const oy = Math.floor((size - doc.h) / 2)
  for (let y = 0; y < doc.h; y++) {
    const ty = oy + y
    if (ty < 0 || ty >= size) continue
    for (let x = 0; x < doc.w; x++) {
      const tx = ox + x
      if (tx < 0 || tx >= size) continue
      const from = (y * doc.w + x) * 4
      out.data.set(doc.data.subarray(from, from + 4), (ty * size + tx) * 4)
    }
  }
  return out
}

/**
 * 어떤 각도로 돌려도 칸 안에 들어가는 가장 큰 배율.
 *
 * 큐브의 꼭짓점은 중심에서 sqrt(3)/2 만큼 떨어져 있고, 세로 투영은 길이가 1보다
 * 크다. 둘을 곱한 값이 최악의 반지름이다.
 */
export function maxScaleFor(size: number, height: number): number {
  const WORST = (Math.sqrt(3) / 2) * Math.hypot(Math.SQRT1_2 * 0.5, 1, Math.SQRT1_2 * 0.5)
  return Math.max(1, Math.floor((size / 2 - height) / WORST))
}
