import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { createApiRouter } from './api'
import { loadServerConfig } from './env'
import { requestUrl, send } from './http'

/**
 * 배포용 독립 실행 서버.
 *
 * `npm run build` 산출물(dist/)을 서비스하면서 API도 같이 붙인다.
 * Vite 개발 서버 없이도 돌기 때문에 VPS, Render, Railway, Fly 등
 * Node가 도는 곳이면 어디든 그대로 올라간다.
 *
 * 정적 파일만 올리는 호스팅(GitHub Pages 등)에는 API가 없으므로
 * AI 생성이 동작하지 않는다. 그 경우 이 서버를 따로 띄우거나
 * createApiRouter를 서버리스 함수로 감싸야 한다.
 */

const DIST = resolve(process.cwd(), 'dist')
const PORT = Number(process.env.PORT ?? 4173)
const HOST = process.env.HOST ?? '0.0.0.0'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

/** 경로 조작으로 dist 밖의 파일이 새어 나가지 않게 막는다. */
function safeStaticPath(pathname: string): string | null {
  const decoded = decodeURIComponent(pathname)
  const full = resolve(join(DIST, decoded))
  if (full !== DIST && !full.startsWith(DIST + sep)) return null
  return full
}

async function tryFile(path: string): Promise<string | null> {
  try {
    const info = await stat(path)
    if (info.isDirectory()) return null
    return path
  } catch {
    return null
  }
}

const router = createApiRouter(loadServerConfig())
const config = loadServerConfig()

const server = createServer(async (req, res) => {
  const url = requestUrl(req)

  try {
    if (await router(req, res, url)) return

    // 처리되지 않은 /api/* 는 SPA로 넘기지 않는다. 그러면 404 대신 HTML이 와서
    // 클라이언트가 JSON 파싱 오류로 헤매게 된다.
    if (url.pathname.startsWith('/api/')) {
      send(res, 404, { error: `알 수 없는 엔드포인트: ${url.pathname}` })
      return
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, { error: `${req.method} 는 지원하지 않습니다.` })
      return
    }

    const candidate = safeStaticPath(url.pathname)
    if (candidate === null) {
      send(res, 400, { error: '잘못된 경로입니다.' })
      return
    }

    // 파일이 있으면 그대로, 없으면 SPA 진입점으로 되돌린다.
    const file = (await tryFile(candidate)) ?? (await tryFile(join(DIST, 'index.html')))
    if (file === null) {
      send(res, 500, {
        error: 'dist/index.html 이 없습니다. `npm run build` 를 먼저 실행하세요.',
      })
      return
    }

    const ext = extname(file).toLowerCase()
    res.statusCode = 200
    res.setHeader('content-type', MIME[ext] ?? 'application/octet-stream')
    // 해시가 붙은 에셋만 오래 캐시한다. index.html을 캐시하면 배포가 반영되지 않는다.
    res.setHeader(
      'cache-control',
      url.pathname.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    )

    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(file).pipe(res)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[serve] ${message}`)
    if (!res.headersSent) send(res, 500, { error: message })
    else res.end()
  }
})

server.listen(PORT, HOST, () => {
  console.log(`We-Pixel  http://localhost:${PORT}`)
  console.log(`  정적 파일 : ${DIST}`)
  console.log(
    `  AI 생성   : ${config.apiKey.length > 0 ? `사용 가능 (${config.model})` : '비활성 — GEMINI_API_KEY 없음'}`,
  )
})
