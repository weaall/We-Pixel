import type { PixelSpec } from '../core/codec'
import { fromSpec, toSpec } from '../core/codec'
import type { PixelDoc } from '../core/doc'
import { createDoc } from '../core/doc'
import { quantize } from '../core/quantize'

export interface Page {
  id: string
  name: string
  doc: PixelDoc
}

interface StoredPage {
  id: string
  name: string
  spec: PixelSpec
}

interface StoredState {
  version: 1
  activeId: string
  pages: StoredPage[]
}

const KEY = 'wepixel:pages'
/** localStorage 는 보통 5MB 다. 넘치기 전에 막는다. */
const MAX_BYTES = 4_000_000

let counter = 0
export function newPageId(): string {
  counter += 1
  return `p${Date.now().toString(36)}${counter.toString(36)}`
}

export function createPage(name: string, w = 32, h = 32): Page {
  return { id: newPageId(), name, doc: createDoc(w, h) }
}

/**
 * spec 으로 바꾼다. 색이 한도를 넘으면 줄여서라도 저장한다.
 *
 * 여기서 던지면 그 페이지만 통째로 사라진다. 사진에서 가져온 그림은 색이
 * 수천 개라 실제로 자주 걸린다.
 */
function toStorable(doc: PixelDoc): PixelSpec {
  try {
    return toSpec(doc)
  } catch {
    return toSpec(quantize(doc, { colors: 56, dither: false, alphaThreshold: 128 }))
  }
}

export interface SaveResult {
  ok: boolean
  reason?: string
}

export function savePages(pages: ReadonlyArray<Page>, activeId: string): SaveResult {
  const state: StoredState = {
    version: 1,
    activeId,
    pages: pages.map((p) => ({ id: p.id, name: p.name, spec: toStorable(p.doc) })),
  }
  const text = JSON.stringify(state)
  if (text.length > MAX_BYTES) {
    return { ok: false, reason: '저장 용량을 넘었습니다. 페이지를 줄이거나 파일로 내보내세요.' }
  }
  try {
    localStorage.setItem(KEY, text)
    return { ok: true }
  } catch (err) {
    const quota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    return {
      ok: false,
      reason: quota
        ? '브라우저 저장 공간이 찼습니다. 페이지를 지우거나 파일로 내보내세요.'
        : `저장 실패: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

export interface LoadResult {
  pages: Page[]
  activeId: string
  /** 읽지 못해 버린 페이지 수. 조용히 넘기면 사라진 이유를 알 수 없다. */
  dropped: number
}

export function loadPages(): LoadResult | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return null
  }
  if (raw === null) return null

  let state: StoredState
  try {
    state = JSON.parse(raw) as StoredState
  } catch {
    return null
  }
  if (state?.version !== 1 || !Array.isArray(state.pages)) return null

  const pages: Page[] = []
  let dropped = 0
  for (const stored of state.pages) {
    try {
      pages.push({ id: stored.id, name: stored.name, doc: fromSpec(stored.spec) })
    } catch {
      // 손상된 페이지 하나 때문에 전체를 잃지 않는다.
      dropped++
    }
  }
  if (pages.length === 0) return null

  const activeId = pages.some((p) => p.id === state.activeId) ? state.activeId : pages[0].id
  return { pages, activeId, dropped }
}

export function clearStoredPages(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // 지우지 못해도 할 수 있는 것이 없다.
  }
}

/** 이름이 겹치지 않게 번호를 붙인다. */
export function nextPageName(existing: ReadonlyArray<Page>, prefix = '페이지'): string {
  for (let n = 1; ; n++) {
    const name = `${prefix} ${n}`
    if (!existing.some((p) => p.name === name)) return name
  }
}

/** 주어진 이름을 그대로 쓰되, 겹치면 뒤에 번호를 붙인다. */
export function uniqueName(existing: ReadonlyArray<Page>, name: string): string {
  if (!existing.some((p) => p.name === name)) return name
  for (let n = 2; ; n++) {
    const candidate = `${name} ${n}`
    if (!existing.some((p) => p.name === candidate)) return candidate
  }
}
