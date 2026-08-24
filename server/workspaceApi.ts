import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { fromSpec } from '../src/core/codec'
import type { PixelSpec } from '../src/core/codec'
import { listSpecs, loadSpec, saveSpec, workspaceRoot } from '../mcp/workspace'

/**
 * 웹 에디터와 MCP 서버가 같은 작업 폴더를 공유하게 하는 개발용 API.
 *
 * 이것이 있어야 순환이 닫힌다:
 *   MCP로 그림 → 에디터에서 픽셀 수정 → 저장 → MCP의 get_design으로 수정 확인
 *
 * 파일 접근 로직은 mcp/workspace.ts를 그대로 쓴다. 경로 검증을 두 곳에 두면
 * 한쪽만 고쳐지기 마련이다.
 */

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > 1024 * 1024) {
        reject(new Error('요청 본문이 너무 큽니다.'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export function workspaceApiPlugin(): Plugin {
  return {
    name: 'we-pixel-workspace-api',
    apply: 'serve',

    configureServer(server) {
      server.middlewares.use('/api/designs', async (req, res, next) => {
        // use()로 마운트하면 req.url은 마운트 지점 이후만 담긴다.
        const rest = (req.url ?? '/').split('?')[0]
        const name = decodeURIComponent(rest.replace(/^\/+/, ''))

        try {
          if (req.method === 'GET' && name.length === 0) {
            send(res, 200, { root: workspaceRoot(), designs: await listSpecs() })
            return
          }
          if (req.method === 'GET') {
            send(res, 200, { name, spec: await loadSpec(name) })
            return
          }
          if (req.method === 'PUT') {
            if (name.length === 0) {
              send(res, 400, { error: '이름이 필요합니다.' })
              return
            }
            const body = JSON.parse(await readBody(req)) as { spec?: PixelSpec }
            if (!body.spec) {
              send(res, 400, { error: 'spec 이 없습니다.' })
              return
            }
            // 저장 전에 검증한다. 깨진 spec을 파일에 남기면 MCP 쪽에서 터진다.
            fromSpec(body.spec)
            const path = await saveSpec(name, body.spec)
            send(res, 200, { name, path })
            return
          }
          next()
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          send(res, 400, { error: message })
        }
      })
    },
  }
}
