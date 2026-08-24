import type { Plugin } from 'vite'
import { createApiRouter } from './api'
import { loadServerConfig } from './env'
import { requestUrl } from './http'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * 개발 서버와 preview 서버에 API를 붙인다.
 *
 * preview에도 붙이는 이유: `npm run preview`는 실제 빌드 산출물을 띄우므로,
 * 배포 전에 프로덕션 번들 + API 조합을 그대로 확인할 수 있어야 한다.
 * 실제 배포는 server/serve.ts 가 담당한다.
 */
export function apiPlugin(): Plugin {
  const mount = (use: (fn: Middleware) => void) => {
    const router = createApiRouter(loadServerConfig())
    use(async (req, res, next) => {
      try {
        if (!(await router(req, res, requestUrl(req)))) next()
      } catch (err) {
        next(err)
      }
    })
  }

  return {
    name: 'we-pixel-api',
    apply: 'serve',
    configureServer(server) {
      mount((fn) => server.middlewares.use(fn))
    },
    configurePreviewServer(server) {
      mount((fn) => server.middlewares.use(fn))
    },
  }
}

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void
