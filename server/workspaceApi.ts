import { fromSpec } from '../src/core/codec'
import type { PixelSpec } from '../src/core/codec'
import { listSpecs, loadSpec, saveSpec, workspaceRoot } from './workspace'
import type { ApiHandler } from './http'
import { readBody, send } from './http'

/**
 * 웹 에디터와 MCP 서버가 같은 작업 폴더를 공유하게 하는 API.
 *
 * 이것이 있어야 순환이 닫힌다:
 *   MCP로 그림 → 에디터에서 픽셀 수정 → 저장 → MCP의 get_design으로 수정 확인
 *
 * 파일 접근 로직은 mcp/workspace.ts를 그대로 쓴다. 경로 검증을 두 곳에 두면
 * 한쪽만 고쳐지기 마련이다.
 */

const PREFIX = '/api/designs'

export function createWorkspaceHandler(): ApiHandler {
  return async (req, res, url) => {
    if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false

    const name = decodeURIComponent(url.pathname.slice(PREFIX.length).replace(/^\/+/, ''))

    try {
      if (req.method === 'GET' && name.length === 0) {
        send(res, 200, { root: workspaceRoot(), designs: await listSpecs() })
        return true
      }
      if (req.method === 'GET') {
        send(res, 200, { name, spec: await loadSpec(name) })
        return true
      }
      if (req.method === 'PUT') {
        if (name.length === 0) {
          send(res, 400, { error: '이름이 필요합니다.' })
          return true
        }
        const body = JSON.parse(await readBody(req)) as { spec?: PixelSpec }
        if (!body.spec) {
          send(res, 400, { error: 'spec 이 없습니다.' })
          return true
        }
        // 저장 전에 검증한다. 깨진 spec을 파일에 남기면 MCP 쪽에서 터진다.
        fromSpec(body.spec)
        const path = await saveSpec(name, body.spec)
        send(res, 200, { name, path })
        return true
      }

      send(res, 405, { error: `${req.method} 는 지원하지 않습니다.` })
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      send(res, 400, { error: message })
      return true
    }
  }
}
