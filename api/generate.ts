import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadServerConfig } from '../server/env'
import { createGeminiHandler } from '../server/gemini'
import { requestUrl, send } from '../server/http'

/**
 * Vercel 서버리스 함수 진입점.
 *
 * /api 아래 파일은 Vercel이 자동으로 함수로 인식한다. 로직은 새로 쓰지 않고
 * server/gemini.ts 의 핸들러를 그대로 얹는다 — 개발 서버(server/vitePlugin.ts)와
 * 독립 실행 서버(server/serve.ts)가 쓰는 것과 동일한 코드다.
 *
 * 워밍 인스턴스 사이에서 재사용되도록 모듈 스코프에서 한 번만 만든다.
 */
const handler = createGeminiHandler(loadServerConfig())

export default async function generate(req: IncomingMessage, res: ServerResponse) {
  const handled = await handler(req, res, requestUrl(req))
  if (!handled) send(res, 404, { error: '알 수 없는 엔드포인트입니다.' })
}
