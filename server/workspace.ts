import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve, sep } from 'node:path'
import type { PixelSpec } from '../src/core/codec'

/**
 * spec 파일 저장소. MCP 서버와 웹 에디터 API가 공유한다.
 *
 * server/ 에 두는 이유: server/workspaceApi.ts 가 이 로직을 쓰는데, 이게 mcp/ 에
 * 있으면 배포 시 mcp/ 를 제외하는 순간 server/ 타입 체크가 깨진다.
 * 파일시스템 접근은 서버 계층의 관심사이므로 여기가 제 자리다.
 *
 * 이름은 MCP 클라이언트(=모델)가 넘기는 값이므로 경로로 신뢰할 수 없다.
 * 문자 화이트리스트로 걸러낸 뒤, 최종 경로가 작업 폴더 안에 있는지 다시 확인한다.
 */

const DEFAULT_DIR = 'workspace'

export function workspaceRoot(): string {
  const fromEnv = process.env.WE_PIXEL_WORKSPACE
  if (fromEnv && fromEnv.trim().length > 0) {
    return isAbsolute(fromEnv) ? fromEnv : resolve(process.cwd(), fromEnv)
  }
  return resolve(process.cwd(), DEFAULT_DIR)
}

export function exportsDir(): string {
  return join(workspaceRoot(), 'exports')
}

export class InvalidNameError extends Error {
  constructor(raw: string) {
    super(
      `잘못된 이름 "${raw}". 영문, 숫자, 밑줄, 하이픈만 쓸 수 있습니다 (최대 64자).`,
    )
    this.name = 'InvalidNameError'
  }
}

/** 경로 조작을 막기 위해 파일명으로 쓸 수 있는 문자만 통과시킨다. */
export function assertSafeName(raw: string): string {
  const name = raw.trim()
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) throw new InvalidNameError(raw)
  return name
}

/** 화이트리스트를 통과했더라도 최종 경로가 루트 밖으로 나가지 않는지 확인한다. */
function safeJoin(dir: string, filename: string): string {
  const full = resolve(dir, filename)
  const root = resolve(dir)
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error(`작업 폴더를 벗어나는 경로입니다: ${filename}`)
  }
  return full
}

export function specPath(name: string): string {
  return safeJoin(workspaceRoot(), `${assertSafeName(name)}.spec.json`)
}

export async function saveSpec(name: string, spec: PixelSpec): Promise<string> {
  const path = specPath(name)
  await mkdir(workspaceRoot(), { recursive: true })
  await writeFile(path, JSON.stringify(spec, null, 2), 'utf8')
  return path
}

export async function loadSpec(name: string): Promise<PixelSpec> {
  const path = specPath(name)
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    throw new Error(`"${name}" 을 찾을 수 없습니다. list_designs로 목록을 확인하세요.`)
  }
  const parsed: unknown = JSON.parse(text)
  if (!isSpecShape(parsed)) throw new Error(`${path} 의 형식이 spec이 아닙니다.`)
  return parsed
}

export interface SpecEntry {
  name: string
  size: string
  colors: number
  modified: string
}

export async function listSpecs(): Promise<SpecEntry[]> {
  const root = workspaceRoot()
  let files: string[]
  try {
    files = await readdir(root)
  } catch {
    return []
  }

  const out: SpecEntry[] = []
  for (const f of files) {
    if (!f.endsWith('.spec.json')) continue
    const name = f.slice(0, -'.spec.json'.length)
    try {
      const [spec, info] = await Promise.all([loadSpec(name), stat(join(root, f))])
      out.push({
        name,
        size: `${spec.w}x${spec.h}`,
        colors: Object.keys(spec.palette).length,
        modified: info.mtime.toISOString(),
      })
    } catch {
      // 손상된 파일 하나 때문에 목록 전체가 실패하지 않게 넘긴다.
    }
  }
  return out.sort((a, b) => b.modified.localeCompare(a.modified))
}

export async function writeExport(filename: string, bytes: Uint8Array): Promise<string> {
  const dir = exportsDir()
  await mkdir(dir, { recursive: true })
  const path = safeJoin(dir, filename)
  await writeFile(path, bytes)
  return path
}

function isSpecShape(v: unknown): v is PixelSpec {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.w === 'number' &&
    typeof o.h === 'number' &&
    typeof o.palette === 'object' &&
    o.palette !== null &&
    Array.isArray(o.rows)
  )
}
