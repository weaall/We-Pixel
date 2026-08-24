import type { PixelDoc } from './doc'
import { cloneDoc } from './doc'

/**
 * 스냅샷 기반 undo/redo.
 * 64x64 문서 하나가 16KB이므로, 커맨드 패턴의 복잡도를 감수할 이유가 없다.
 */
export class History {
  private past: PixelDoc[] = []
  private future: PixelDoc[] = []

  constructor(private readonly limit = 64) {}

  /** 문서를 변경하기 직전 상태를 기록한다. redo 스택은 무효화된다. */
  commit(before: PixelDoc): void {
    this.past.push(cloneDoc(before))
    if (this.past.length > this.limit) this.past.shift()
    this.future = []
  }

  undo(current: PixelDoc): PixelDoc | null {
    const prev = this.past.pop()
    if (!prev) return null
    this.future.push(cloneDoc(current))
    return prev
  }

  redo(current: PixelDoc): PixelDoc | null {
    const next = this.future.pop()
    if (!next) return null
    this.past.push(cloneDoc(current))
    return next
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  clear(): void {
    this.past = []
    this.future = []
  }
}
