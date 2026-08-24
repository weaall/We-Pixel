import type { ServerConfig } from './env'
import { loadServerConfig } from './env'
import type { ApiHandler } from './http'
import { createGeminiHandler } from './gemini'
import { createWorkspaceHandler } from './workspaceApi'

/**
 * API 라우터. 개발 서버(Vite 미들웨어)와 배포 서버(node:http)가 이걸 공유한다.
 * 라우팅을 한 곳에 모아 두어야 한쪽에만 엔드포인트가 붙는 사고가 안 생긴다.
 */
export function createApiRouter(config: ServerConfig = loadServerConfig()): ApiHandler {
  const handlers = [createGeminiHandler(config), createWorkspaceHandler()]

  return async (req, res, url) => {
    for (const handle of handlers) {
      if (await handle(req, res, url)) return true
    }
    return false
  }
}
