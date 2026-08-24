import type { PixelSpec } from '../core/codec'
import { DESIGN_NAME_RULE, isValidDesignName } from '../core/names'

export interface DesignEntry {
  name: string
  size: string
  colors: number
  modified: string
}

/**
 * 디자인 저장소.
 *
 * 두 구현이 있다.
 *
 * - server  : /api/designs. 로컬 개발과 `npm start` 서버에서 동작하며,
 *             MCP 서버와 같은 폴더를 공유한다. 순환이 닫히는 쪽.
 * - browser : localStorage. 서버 API가 없는 배포 환경(서버리스)용.
 *
 * 서버리스의 파일시스템은 권한을 바꿔서 열 수 있는 게 아니다. /tmp 외에는
 * 읽기 전용이고, /tmp 조차 인스턴스마다 따로이며 재활용되면 사라진다.
 * 그래서 배포판에서는 서버에 쓰려 하지 않고 브라우저에 저장한다.
 */
export interface SpecStore {
  readonly kind: 'server' | 'browser'
  /** UI에 표시할 위치 설명. */
  readonly label: string
  list(): Promise<DesignEntry[]>
  load(name: string): Promise<PixelSpec>
  /** 저장한 위치 설명을 돌려준다. */
  save(name: string, spec: PixelSpec): Promise<string>
  remove(name: string): Promise<void>
}

export class InvalidNameError extends Error {
  constructor(raw: string) {
    super(`잘못된 이름 "${raw}". ${DESIGN_NAME_RULE}`)
    this.name = 'InvalidNameError'
  }
}

function assertName(raw: string): string {
  const name = raw.trim()
  if (!isValidDesignName(name)) throw new InvalidNameError(raw)
  return name
}

function describe(spec: PixelSpec): { size: string; colors: number } {
  return { size: `${spec.w}x${spec.h}`, colors: Object.keys(spec.palette).length }
}

// ---------------------------------------------------------------------------
// server — /api/designs
// ---------------------------------------------------------------------------

class ServerSpecStore implements SpecStore {
  readonly kind = 'server' as const

  constructor(readonly label: string) {}

  async list(): Promise<DesignEntry[]> {
    const res = await fetch('/api/designs')
    if (!res.ok) throw new Error(`목록을 못 읽었습니다 (HTTP ${res.status}).`)
    const payload = (await res.json()) as { designs: DesignEntry[] }
    return payload.designs
  }

  async load(name: string): Promise<PixelSpec> {
    const res = await fetch(`/api/designs/${encodeURIComponent(assertName(name))}`)
    const payload = (await res.json()) as { spec?: PixelSpec; error?: string }
    if (!res.ok || !payload.spec) throw new Error(payload.error ?? `HTTP ${res.status}`)
    return payload.spec
  }

  async save(name: string, spec: PixelSpec): Promise<string> {
    const res = await fetch(`/api/designs/${encodeURIComponent(assertName(name))}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ spec }),
    })
    const payload = (await res.json()) as { path?: string; error?: string }
    if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`)
    return payload.path ?? name
  }

  async remove(): Promise<void> {
    // 서버 API에 삭제가 없다. 파일 삭제는 되돌릴 수 없어 의도적으로 두지 않았다.
    throw new Error('서버 저장소에서는 삭제를 지원하지 않습니다. 파일을 직접 지우세요.')
  }
}

// ---------------------------------------------------------------------------
// browser — localStorage
// ---------------------------------------------------------------------------

const PREFIX = 'wepixel:design:'

interface StoredRecord {
  spec: PixelSpec
  modified: string
}

class BrowserSpecStore implements SpecStore {
  readonly kind = 'browser' as const
  readonly label = '이 브라우저에 저장 (서버 없음)'

  async list(): Promise<DesignEntry[]> {
    const out: DesignEntry[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key === null || !key.startsWith(PREFIX)) continue
      const name = key.slice(PREFIX.length)
      const record = this.read(name)
      // 손상된 항목 하나 때문에 목록 전체가 실패하지 않게 한다.
      if (record === null) continue
      out.push({ name, modified: record.modified, ...describe(record.spec) })
    }
    return out.sort((a, b) => b.modified.localeCompare(a.modified))
  }

  async load(name: string): Promise<PixelSpec> {
    const record = this.read(assertName(name))
    if (record === null) throw new Error(`"${name}" 을 이 브라우저에서 찾을 수 없습니다.`)
    return record.spec
  }

  async save(name: string, spec: PixelSpec): Promise<string> {
    const key = PREFIX + assertName(name)
    const record: StoredRecord = { spec, modified: new Date().toISOString() }
    try {
      localStorage.setItem(key, JSON.stringify(record))
    } catch (err) {
      // localStorage는 보통 5MB 정도다. 용량 초과는 조용히 넘기면 안 된다.
      const quota =
        err instanceof DOMException &&
        (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
      throw new Error(
        quota
          ? '브라우저 저장 공간이 찼습니다. 오래된 디자인을 지우거나 파일로 내보내세요.'
          : `저장 실패: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    return this.label
  }

  async remove(name: string): Promise<void> {
    localStorage.removeItem(PREFIX + assertName(name))
  }

  private read(name: string): StoredRecord | null {
    const raw = localStorage.getItem(PREFIX + name)
    if (raw === null) return null
    try {
      const parsed = JSON.parse(raw) as StoredRecord
      if (typeof parsed?.spec?.w !== 'number' || !Array.isArray(parsed?.spec?.rows)) return null
      return { spec: parsed.spec, modified: parsed.modified ?? '' }
    } catch {
      return null
    }
  }
}

// ---------------------------------------------------------------------------

/**
 * 서버 API가 살아 있는지 한 번 확인해 저장소를 고른다.
 * 배포된 서버리스 환경에서는 /api/designs 함수가 없어 404가 오므로 브라우저로 넘어간다.
 */
export async function detectStore(): Promise<SpecStore> {
  try {
    const res = await fetch('/api/designs', { method: 'GET' })
    if (res.ok) {
      const payload = (await res.json()) as { root?: string }
      return new ServerSpecStore(payload.root ?? '/api/designs')
    }
  } catch {
    // 네트워크 오류도 서버 없음으로 취급한다.
  }
  return new BrowserSpecStore()
}
