import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { loadEnv } from 'vite'
import type { PixelSpec } from '../src/core/codec'
import { TRANSPARENT_CHAR } from '../src/core/codec'

/**
 * Gemini 프록시.
 *
 * API 키는 서버에만 있어야 한다. 브라우저에서 직접 부르면 개발자 도구로
 * 키가 그대로 노출된다. 그래서 Vite 개발 서버에 미들웨어로 붙인다.
 * 키는 loadEnv로 읽으며 클라이언트 번들에는 들어가지 않는다.
 *
 * 배포 시에는 이 핸들러 로직을 서버리스 함수로 옮기면 된다.
 */

const DEFAULT_MODEL = 'gemini-2.5-flash'
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

const SYSTEM_INSTRUCTION = [
  '당신은 픽셀 아트 도터입니다. 요청받은 대상을 지정된 크기의 픽셀 그리드로 그립니다.',
  '',
  '규칙:',
  '- 색은 4~10종으로 제한합니다. 색이 많으면 픽셀 아트로 보이지 않습니다.',
  '- 외곽선은 본체보다 훨씬 어두운 색으로 실루엣 전체를 감쌉니다.',
  '- 명암은 위에서 빛이 오는 것으로 통일합니다. 상단 경계는 밝게, 하단은 어둡게.',
  '- 캔버스를 넉넉히 채우되 사방 1픽셀은 비워 외곽선이 잘리지 않게 합니다.',
  '- 배경은 반드시 "." (투명)으로 둡니다. 배경색을 칠하지 않습니다.',
  '- 작은 크기에서 형태가 읽히는 것이 디테일보다 중요합니다. 실루엣을 먼저 잡으세요.',
  '- 좌우 대칭이 어울리는 대상(생물, 정면 얼굴)은 대칭으로 그립니다.',
  '',
  'palette의 char는 반드시 한 글자이며, "." 은 투명으로 예약되어 있으니 palette에 넣지 마세요.',
  'rows는 정확히 h개의 문자열이고, 각 문자열은 정확히 w글자여야 합니다. 글자 수를 세면서 작성하세요.',
].join('\n')

/** Gemini의 responseSchema는 동적 키를 표현할 수 없어 팔레트를 배열로 받는다. */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    palette: {
      type: 'ARRAY',
      description: '사용할 색 목록. 4~10개.',
      items: {
        type: 'OBJECT',
        properties: {
          char: { type: 'STRING', description: '그리드에서 이 색을 나타낼 한 글자' },
          hex: { type: 'STRING', description: '#rrggbb 형식' },
        },
        required: ['char', 'hex'],
      },
    },
    rows: {
      type: 'ARRAY',
      description: '위에서 아래로 h개의 행. 각 행은 w글자.',
      items: { type: 'STRING' },
    },
  },
  required: ['palette', 'rows'],
} as const

export interface RawResult {
  palette?: Array<{ char?: string; hex?: string }>
  rows?: string[]
}

export interface GenerateResponse {
  spec: PixelSpec
  warnings: string[]
  model: string
}

/**
 * 모델이 글자 수를 틀리는 것은 흔한 일이다. 실패로 되돌리기보다 고쳐 쓰고 무엇을
 * 고쳤는지 알린다. 조용히 고치면 품질 문제를 사용자가 눈치채지 못한다.
 */
export function repairSpec(raw: RawResult, w: number, h: number): GenerateResponse['spec'] & { warnings: string[] } {
  const warnings: string[] = []
  const palette: Record<string, string> = { [TRANSPARENT_CHAR]: 'transparent' }

  for (const entry of raw.palette ?? []) {
    const char = (entry.char ?? '').trim()
    const hex = (entry.hex ?? '').trim()
    if (char.length !== 1 || char === TRANSPARENT_CHAR) continue
    if (!/^#[0-9a-fA-F]{3,8}$/.test(hex)) continue
    palette[char] = hex
  }
  if (Object.keys(palette).length <= 1) {
    throw new Error('모델이 쓸 수 있는 팔레트를 반환하지 않았습니다.')
  }

  let rows = (raw.rows ?? []).map((r) => String(r))
  if (rows.length !== h) {
    warnings.push(`행 수가 ${rows.length}개로 왔습니다. ${h}개로 맞췄습니다.`)
    rows = rows.slice(0, h)
    while (rows.length < h) rows.push(TRANSPARENT_CHAR.repeat(w))
  }

  let lengthFixes = 0
  let charFixes = 0
  rows = rows.map((row) => {
    let fixed = row
    if (fixed.length !== w) {
      lengthFixes++
      fixed = fixed.length > w ? fixed.slice(0, w) : fixed + TRANSPARENT_CHAR.repeat(w - fixed.length)
    }
    // 팔레트에 없는 글자는 투명으로 떨어뜨린다. fromSpec이 던지는 것보다 낫다.
    return [...fixed]
      .map((ch) => {
        if (palette[ch] !== undefined) return ch
        charFixes++
        return TRANSPARENT_CHAR
      })
      .join('')
  })

  if (lengthFixes > 0) warnings.push(`${lengthFixes}개 행의 길이를 ${w}글자로 맞췄습니다.`)
  if (charFixes > 0) warnings.push(`팔레트에 없는 글자 ${charFixes}개를 투명으로 처리했습니다.`)

  return { w, h, palette, rows, warnings }
}

async function callGemini(
  apiKey: string,
  model: string,
  prompt: string,
  w: number,
  h: number,
): Promise<RawResult> {
  const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // 쿼리스트링이 아니라 헤더로 보낸다. URL은 로그와 히스토리에 남는다.
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [
        {
          role: 'user',
          parts: [{ text: `${w}x${h} 픽셀 아트로 그려주세요: ${prompt}` }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 1,
      },
    }),
  })

  const bodyText = await res.text()
  if (!res.ok) {
    // 응답 본문에 키가 섞여 돌아오지는 않지만, 그대로 흘리지 않고 요약만 전달한다.
    let detail = `HTTP ${res.status}`
    try {
      const parsed = JSON.parse(bodyText) as { error?: { message?: string; status?: string } }
      if (parsed.error?.message) detail = `${parsed.error.status ?? res.status}: ${parsed.error.message}`
    } catch {
      detail = `HTTP ${res.status} ${bodyText.slice(0, 200)}`
    }
    throw new Error(`Gemini 호출 실패 — ${detail}`)
  }

  const payload = JSON.parse(bodyText) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    promptFeedback?: { blockReason?: string }
  }
  if (payload.promptFeedback?.blockReason) {
    throw new Error(`요청이 차단되었습니다: ${payload.promptFeedback.blockReason}`)
  }

  const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (text.trim().length === 0) throw new Error('모델이 빈 응답을 반환했습니다.')

  return JSON.parse(text) as RawResult
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > 64 * 1024) {
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

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(text)
}

/** Vite 개발 서버에 POST /api/generate 를 붙인다. */
export function geminiPlugin(): Plugin {
  let apiKey = ''
  let model = DEFAULT_MODEL

  return {
    name: 'we-pixel-gemini',
    apply: 'serve',

    config(_config, { mode }) {
      // 접두사 ''로 불러야 VITE_ 가 아닌 변수까지 읽는다.
      // define으로 넘기지 않으므로 클라이언트 번들에는 들어가지 않는다.
      const env = loadEnv(mode, process.cwd(), '')
      apiKey = env.GEMINI_API_KEY ?? ''
      model = env.GEMINI_MODEL ?? DEFAULT_MODEL
    },

    configureServer(server) {
      server.middlewares.use('/api/generate', async (req, res, next) => {
        if (req.method === 'GET') {
          send(res, 200, { ready: apiKey.length > 0, model })
          return
        }
        if (req.method !== 'POST') {
          next()
          return
        }

        if (apiKey.length === 0) {
          send(res, 503, {
            error:
              'GEMINI_API_KEY 가 설정되지 않았습니다. .env.example 을 .env 로 복사하고 키를 채운 뒤 개발 서버를 다시 시작하세요.',
          })
          return
        }

        try {
          const parsed = JSON.parse(await readBody(req)) as {
            prompt?: unknown
            w?: unknown
            h?: unknown
          }
          const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : ''
          const w = Math.min(64, Math.max(8, Number(parsed.w) || 32))
          const h = Math.min(64, Math.max(8, Number(parsed.h) || 32))

          if (prompt.length === 0) {
            send(res, 400, { error: '프롬프트가 비어 있습니다.' })
            return
          }
          // 64px을 넘으면 행 문자열이 길어져 모델이 글자 수를 유지하지 못한다.
          if (Number(parsed.w) > 64 || Number(parsed.h) > 64) {
            send(res, 400, {
              error: 'AI 생성은 64x64까지 지원합니다. 더 큰 캔버스는 생성 후 크기를 늘리세요.',
            })
            return
          }

          const raw = await callGemini(apiKey, model, prompt, w, h)
          const { warnings, ...spec } = repairSpec(raw, w, h)
          send(res, 200, { spec, warnings, model } satisfies GenerateResponse)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          server.config.logger.error(`[gemini] ${message}`)
          send(res, 502, { error: message })
        }
      })
    },
  }
}
