import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadServerConfig } from './env'
import { createGeminiHandler } from './gemini'
import { requestUrl, send } from './http'

/**
 * Vercel 서버리스 함수의 소스.
 *
 * 로직은 새로 쓰지 않고 server/gemini.ts 의 핸들러를 그대로 얹는다 —
 * 개발 서버(vitePlugin.ts)와 독립 실행 서버(serve.ts)가 쓰는 것과 동일한 코드다.
 *
 * 이 파일은 api/ 안에 두지 않는다. Vercel의 Node 빌더는 package.json 이
 * type: module 일 때 진입점만 트랜스파일하고 로컬 import 는 번들하지 않는다.
 * 그러면 확장자 없는 상대 경로가 런타임에 ERR_MODULE_NOT_FOUND 로 죽는다.
 * 그래서 vercel-build 에서 esbuild 로 자체 완결형 번들을 만들어 api/generate.js
 * 로 내보낸다.
 *
 * 워밍 인스턴스 사이에서 재사용되도록 핸들러는 모듈 스코프에서 한 번만 만든다.
 */
const handler = createGeminiHandler(loadServerConfig())

export default async function generate(req: IncomingMessage, res: ServerResponse) {
  const handled = await handler(req, res, requestUrl(req))
  if (!handled) send(res, 404, { error: '알 수 없는 엔드포인트입니다.' })
}
