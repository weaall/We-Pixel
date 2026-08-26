import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 서버 설정 로딩.
 *
 * Vite의 loadEnv를 쓰지 않는다. 개발 서버와 배포 서버가 같은 규칙으로 키를 읽어야
 * "개발에서는 되는데 배포하면 안 된다"는 상황이 생기지 않는다.
 * .env 파서는 20줄이면 되므로 의존성을 늘릴 이유도 없다.
 */

/**
 * 기본 모델.
 *
 * gemini-2.5-flash 는 신규 사용자에게 더 이상 제공되지 않는다
 * (NOT_FOUND: no longer available to new users).
 * 다른 모델을 쓰려면 GEMINI_MODEL 환경변수로 덮어쓴다.
 */
export const DEFAULT_MODEL = 'gemini-3.6-flash'

export interface ServerConfig {
  apiKey: string
  model: string
}

/** KEY=VALUE 형식만 다룬다. 여러 줄 값이나 변수 전개는 지원하지 않는다. */
function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue

    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue

    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function readDotEnv(dir: string): Record<string, string> {
  for (const name of ['.env.local', '.env']) {
    try {
      return parseDotEnv(readFileSync(resolve(dir, name), 'utf8'))
    } catch {
      // 없으면 다음 후보로 넘어간다.
    }
  }
  return {}
}

/**
 * 셸 환경변수를 .env보다 우선한다.
 *   GEMINI_API_KEY=... npm run dev
 * 처럼 파일 없이 바로 띄울 수 있어야 하고, 배포 환경은 보통 실제 환경변수를 쓴다.
 */
export function loadServerConfig(dir = process.cwd()): ServerConfig {
  const file = readDotEnv(dir)
  return {
    apiKey: process.env.GEMINI_API_KEY || file.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || file.GEMINI_MODEL || DEFAULT_MODEL,
  }
}
