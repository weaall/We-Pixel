import { fromSpec } from '../codec'
import type { PixelDoc } from '../doc'
import { createDoc } from '../doc'
import type { DiceTop } from './diceSet'
import { DICE_TOPS, diceSpec } from './diceSet'

export interface RollOptions {
  /** 멈출 눈. */
  result: DiceTop
  /** 전체 칸 수. */
  frames: number
  /** 튀는 횟수. */
  bounces: number
  /** 가장 높이 뜰 때의 픽셀. 여백을 넘으면 잘린다. */
  height: number
  /** 마지막 몇 칸을 결과로 고정할지. */
  settle: number
  palette?: Record<string, string>
}

export const defaultRollOptions: Omit<RollOptions, 'result'> = {
  frames: 12,
  bounces: 3,
  height: 6,
  settle: 3,
}

/**
 * 실루엣 위아래로 남은 여백.
 *
 * 이보다 높이 띄우면 주사위가 칸 밖으로 잘린다. 프레임에서 직접 재야 참고
 * 그림을 바꿔도 따라간다.
 */
export function frameHeadroom(): { top: number; bottom: number } {
  const doc = fromSpec(diceSpec(1))
  let first = doc.h
  let last = -1
  for (let y = 0; y < doc.h; y++) {
    for (let x = 0; x < doc.w; x++) {
      if (doc.data[(y * doc.w + x) * 4 + 3] === 0) continue
      if (y < first) first = y
      last = y
      break
    }
  }
  return { top: first, bottom: doc.h - 1 - last }
}

/**
 * 굴러가는 동안 보여 줄 눈의 차례.
 *
 * 무작위로 뽑지 않는다. 같은 눈이 연달아 나오면 멈춘 것처럼 보이고, 시드를
 * 쓰면 같은 결과를 다시 만들 수 없어 시트를 비교할 수 없다. 결과 눈에서
 * 홀수만큼 떨어진 순서로 돌면 인접한 칸이 겹치지 않는다.
 */
export function rollOrder(result: DiceTop, count: number): DiceTop[] {
  const out: DiceTop[] = []
  for (let i = 0; i < count; i++) {
    // 5는 6과 서로소라 여섯 눈을 모두 지나간다.
    out.push(DICE_TOPS[(DICE_TOPS.indexOf(result) + (i + 1) * 5) % DICE_TOPS.length])
  }
  return out
}

/**
 * 튀는 높이. 0에서 시작해 점점 낮아지다 0으로 끝난다.
 *
 * 마지막이 정확히 0이어야 주사위가 바닥에 놓인 채 멈춘다. 조금이라도 떠 있으면
 * 반복 재생할 때 툭 떨어지는 것이 보인다.
 */
export function bounceAt(t: number, bounces: number, height: number): number {
  if (t >= 1) return 0
  const decay = (1 - t) * (1 - t)
  return Math.round(height * decay * Math.abs(Math.sin(Math.PI * bounces * t)))
}

/** 그림을 위로 올린 새 문서. 칸 크기는 그대로다. */
export function lift(doc: PixelDoc, dy: number): PixelDoc {
  if (dy === 0) return { w: doc.w, h: doc.h, data: new Uint8ClampedArray(doc.data) }
  const out = createDoc(doc.w, doc.h)
  for (let y = 0; y < doc.h; y++) {
    const src = y + dy
    if (src < 0 || src >= doc.h) continue
    const from = src * doc.w * 4
    out.data.set(doc.data.subarray(from, from + doc.w * 4), y * doc.w * 4)
  }
  return out
}

export interface RollFrame {
  top: DiceTop
  /** 이 칸에서 떠 있는 높이. */
  lift: number
  doc: PixelDoc
}

/**
 * 굴리는 애니메이션을 만든다.
 *
 * 큐브를 실제로 회전시키지는 않는다. 회전은 여섯 장에 들어 있지 않은 정보다 —
 * 여섯 장 모두 실루엣이 같고 눈만 다르다. 여기서 만드는 것은 눈이 빠르게
 * 바뀌며 튀다가 결과에 멈추는 연출이다. 픽셀 게임에서 실제로 쓰는 방식이고,
 * 새 그림 없이 가진 것만으로 된다.
 */
export function makeRoll(o: RollOptions): RollFrame[] {
  const frames = Math.max(2, Math.floor(o.frames))
  const settle = Math.min(frames - 1, Math.max(1, Math.floor(o.settle)))
  const room = frameHeadroom()
  const height = Math.min(Math.max(0, Math.floor(o.height)), room.top)

  const spinning = frames - settle
  const order = rollOrder(o.result, spinning)
  const docOf = new Map<DiceTop, PixelDoc>()
  const get = (top: DiceTop) => {
    let d = docOf.get(top)
    if (!d) {
      d = fromSpec(diceSpec(top, o.palette))
      docOf.set(top, d)
    }
    return d
  }

  const out: RollFrame[] = []
  for (let i = 0; i < frames; i++) {
    const top = i < spinning ? order[i] : o.result
    // 마지막 칸의 t 는 1이라 높이가 0이 된다.
    const liftPx = bounceAt(i / (frames - 1), o.bounces, height)
    out.push({ top, lift: liftPx, doc: lift(get(top), liftPx) })
  }
  return out
}

/** 시트로 묶을 때 쓸 항목. */
export function rollSheetItems(
  frames: ReadonlyArray<RollFrame>,
  prefix: string,
): Array<{ name: string; doc: PixelDoc }> {
  return frames.map((f, i) => ({
    name: `${prefix}_${String(i).padStart(2, '0')}`,
    doc: f.doc,
  }))
}
