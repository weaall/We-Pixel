import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateObject } from 'ai'
import { z } from 'zod'
import type { ServerConfig } from './env'

/**
 * LLM 호출 배관.
 *
 * fetch/파싱/에러 처리를 직접 쓰던 것을 AI SDK로 옮겼다. 스키마 강제와 재시도가
 * 딸려오고, 프로바이더를 바꿀 때 이 파일만 고치면 된다 —
 * gemini-2.5-flash 가 단종됐을 때 호출 코드를 뒤져야 했던 일을 피한다.
 *
 * 다만 이 SDK 도 "각 행이 정확히 w글자"까지는 강제하지 못한다. JSON 모양만
 * 보장할 뿐이다. 그 검증과 재요청은 아래에서 직접 한다.
 */

export const gridSchema = z.object({
  palette: z
    .array(z.object({ char: z.string(), hex: z.string() }))
    .describe('사용할 색 목록. 4~10개.'),
  rows: z.array(z.string()).describe('위에서 아래로 h개의 행. 각 행은 w글자.'),
})

export const paletteSchema = z.object({
  palette: z
    .array(z.object({ char: z.string(), hex: z.string() }))
    .describe('받은 것과 같은 char 목록. 각 hex만 새 색으로.'),
})

export type GridResult = z.infer<typeof gridSchema>
export type PaletteResult = z.infer<typeof paletteSchema>

function model(config: ServerConfig) {
  // 키를 환경변수에 의존하지 않고 명시적으로 넘긴다.
  // SDK 기본값은 GOOGLE_GENERATIVE_AI_API_KEY 인데 우리는 GEMINI_API_KEY 를 쓴다.
  return createGoogleGenerativeAI({ apiKey: config.apiKey })(config.model)
}

/** SDK 오류를 사용자에게 보여 줄 한 줄로 줄인다. 스택은 서버 로그로 충분하다. */
function describeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return `Gemini 호출 실패 — ${message.slice(0, 300)}`
}

export interface RowProblem {
  index: number
  length: number
}

/** 행 길이와 개수를 확인한다. 스키마로는 잡히지 않는 부분이다. */
export function findRowProblems(rows: string[], w: number, h: number): RowProblem[] {
  const problems: RowProblem[] = []
  rows.forEach((row, index) => {
    if (row.length !== w) problems.push({ index, length: row.length })
  })
  if (rows.length !== h) problems.push({ index: -1, length: rows.length })
  return problems
}

function describeProblems(problems: RowProblem[], w: number, h: number): string {
  const rowCount = problems.find((p) => p.index === -1)
  const bad = problems.filter((p) => p.index !== -1).slice(0, 12)
  const parts: string[] = []
  if (rowCount) parts.push(`행 수가 ${rowCount.length}개입니다. 정확히 ${h}개여야 합니다.`)
  if (bad.length > 0) {
    parts.push(
      `다음 행의 길이가 틀렸습니다 (정확히 ${w}글자여야 함): ` +
        bad.map((p) => `${p.index}번 ${p.length}자`).join(', '),
    )
  }
  return parts.join(' ')
}

export interface GridCall {
  config: ServerConfig
  system: string
  user: string
  w: number
  h: number
  temperature: number
}

export interface GridOutcome {
  result: GridResult
  /** 재요청했으면 그 이유. UI에 알린다. */
  retryNote: string | null
}

/**
 * 그리드를 받아온다. 형식이 어긋나면 무엇이 틀렸는지 알려주고 한 번 더 묻는다.
 *
 * 예전에는 어긋난 행을 조용히 잘라 맞췄다. 스프라이트는 가운데 정렬이라
 * 그 보정만으로 형태가 밀린다. 다시 묻는 편이 결과가 낫다.
 */
export async function generateGrid(call: GridCall): Promise<GridOutcome> {
  let first: GridResult
  try {
    const out = await generateObject({
      model: model(call.config),
      schema: gridSchema,
      system: call.system,
      prompt: call.user,
      temperature: call.temperature,
    })
    first = out.object
  } catch (err) {
    throw new Error(describeError(err))
  }

  const problems = findRowProblems(first.rows, call.w, call.h)
  if (problems.length === 0) return { result: first, retryNote: null }

  // 전부 틀렸으면 모델이 형식을 이해하지 못한 것이다. 다시 물어도 같을 가능성이 높다.
  if (problems.length > call.h) return { result: first, retryNote: null }

  try {
    const retry = await generateObject({
      model: model(call.config),
      schema: gridSchema,
      system: call.system,
      prompt: [
        call.user,
        '',
        '이전 응답에 형식 오류가 있었습니다.',
        describeProblems(problems, call.w, call.h),
        '같은 그림을 형식만 정확히 맞춰 다시 작성해주세요.',
      ].join('\n'),
      temperature: call.temperature,
    })
    const after = findRowProblems(retry.object.rows, call.w, call.h)
    // 재요청이 더 나빠졌으면 첫 응답을 쓴다.
    if (after.length >= problems.length) {
      return { result: first, retryNote: `형식 오류 ${problems.length}건으로 재요청했지만 개선되지 않았습니다.` }
    }
    return {
      result: retry.object,
      retryNote: `형식 오류 ${problems.length}건을 알리고 다시 받았습니다 (남은 오류 ${after.length}건).`,
    }
  } catch {
    // 재요청이 실패해도 첫 응답은 살아 있다. 보정해서 쓰는 편이 낫다.
    return { result: first, retryNote: `형식 오류 ${problems.length}건. 재요청에 실패해 보정했습니다.` }
  }
}

export async function generatePalette(
  config: ServerConfig,
  system: string,
  user: string,
): Promise<PaletteResult> {
  try {
    const out = await generateObject({
      model: model(config),
      schema: paletteSchema,
      system,
      prompt: user,
      temperature: 0.7,
    })
    return out.object
  } catch (err) {
    throw new Error(describeError(err))
  }
}
