import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * API 핸들러의 공통 형태.
 *
 * 처리했으면 true, 내 경로가 아니면 false를 돌려준다.
 * 이렇게 두면 Vite 미들웨어와 독립 실행 서버가 같은 핸들러를 그대로 쓴다.
 */
export type ApiHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) => Promise<boolean>

export function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function readBody(req: IncomingMessage, maxBytes = 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > maxBytes) {
        reject(new Error(`요청 본문이 너무 큽니다 (최대 ${maxBytes} bytes).`))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** req.url은 경로만 담을 수 있으므로 파싱용 더미 origin을 붙인다. */
export function requestUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
}
