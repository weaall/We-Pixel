import type { PixelSpec } from '../src/core/codec'
import { fromSpec, toSpec, TRANSPARENT_CHAR } from '../src/core/codec'
import { resample } from '../src/core/resample'
import { quantize } from '../src/core/quantize'
import { usedColors } from '../src/core/codec'
import { parseHex } from '../src/core/color'
import type { RGBA } from '../src/core/color'
import { replaceColors } from '../src/core/recolor'
import { getPixel, setPixel } from '../src/core/doc'
import type { PixelDoc } from '../src/core/doc'
import type { ServerConfig } from './env'
import { generateGrid, generatePalette } from './llm'
import type { ApiHandler } from './http'
import { readBody, send } from './http'

/**
 * Gemini 프록시.
 *
 * API 키는 서버에만 있어야 한다. 브라우저에서 직접 부르면 개발자 도구로
 * 키가 그대로 노출된다.
 *
 * 이 파일은 Vite를 import하지 않는다. 개발 서버와 배포 서버가 같은 핸들러를
 * 그대로 써야 "개발에서는 되는데 배포하면 404"가 생기지 않는다.
 */


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

/**
 * 수정 모드 지시.
 *
 * 새로 그릴 때와 요구가 다르다. 요청하지 않은 부분까지 다시 그리면
 * "모자만 씌워줘"가 전혀 다른 그림으로 돌아온다.
 */
const EDIT_INSTRUCTION = [
  '당신은 픽셀 아트 도터입니다. 주어진 픽셀 그리드를 요청대로 수정합니다.',
  '',
  '규칙:',
  '- 요청과 무관한 부분은 원본 그대로 두세요. 전체를 다시 그리지 마세요.',
  '- 기존 팔레트 문자를 그대로 재사용하세요. 새 색이 꼭 필요할 때만 추가합니다.',
  '- 원본의 실루엣과 자세를 유지하세요. 요청이 그것을 바꾸라는 것이 아니라면.',
  '- 명암 방향은 원본을 따르세요.',
  '',
  'palette의 char는 반드시 한 글자이며, "." 은 투명으로 예약되어 있으니 palette에 넣지 마세요.',
  'rows는 정확히 h개의 문자열이고, 각 문자열은 정확히 w글자여야 합니다. 글자 수를 세면서 작성하세요.',
].join('\n')

/**
 * 추가 모드 지시.
 *
 * 수정 모드와 달리 기존 픽셀은 서버가 강제로 지킨다. 모델이 전체를 다시 그려
 * 보내도 원본이 있는 자리는 무시된다. 그래서 지시도 "빈 자리에만 그려라"로
 * 좁혀 두는 편이 결과가 낫다.
 */
const ADD_INSTRUCTION = [
  '당신은 픽셀 아트 도터입니다. 이미 있는 그림에 요소를 덧붙입니다.',
  '',
  '규칙:',
  '- 덧붙일 요소만 그리고, 나머지는 전부 "." (투명)으로 두세요.',
  '- 요소가 기존 그림을 자연스럽게 가려야 한다면 그 부분까지 그리세요.',
  '  예: 모자는 머리 윗부분을 덮습니다. 무기는 손을 가릴 수 있습니다.',
  '- 다만 기존 그림 전체를 다시 그리지는 마세요. 덧붙일 요소와 그것이 가리는 부분만입니다.',
  '- 기존 그림에 자연스럽게 닿도록 위치를 잡으세요. 떠 있으면 안 됩니다.',
  '- 기존 팔레트와 어울리는 색을 쓰고, 명암 방향도 원본을 따르세요.',
  '',
  'palette의 char는 반드시 한 글자이며, "." 은 투명으로 예약되어 있으니 palette에 넣지 마세요.',
  'rows는 정확히 h개의 문자열이고, 각 문자열은 정확히 w글자여야 합니다. 글자 수를 세면서 작성하세요.',
].join('\n')

/**
 * 팔레트 교체 지시.
 *
 * 그리드를 받지 않는 것이 핵심이다. 모델에게 그림을 그리게 하면 "색만 바꿔줘"라고
 * 해도 형태가 같이 바뀐다 — 주사위 눈 모양이 달라지는 식이다. 색 목록만 받아
 * 기존 픽셀에 적용하면 모양은 한 픽셀도 바뀔 수 없다.
 */
const RECOLOR_INSTRUCTION = [
  '당신은 픽셀 아트의 색 배합을 정하는 사람입니다.',
  '',
  '주어진 팔레트의 각 색을 요청에 맞는 새 색으로 바꿔 돌려주세요.',
  '',
  '규칙:',
  '- 그림을 그리지 마세요. 색 목록만 돌려줍니다.',
  '- 받은 char를 하나도 빠짐없이, 그대로 돌려주세요. 새 char를 만들지 마세요.',
  '- 명암 관계를 유지하세요. 원본에서 어두웠던 색은 새 배합에서도 어두워야 합니다.',
  '- 바꿀 필요가 없는 색은 원래 값을 그대로 돌려주세요.',
  '- hex는 "#rrggbb" 형식입니다.',
].join('\n')

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
/**
 * 행을 목표 너비에 맞춘다.
 *
 * 끝에서 자르거나 채우면 그림 전체가 한쪽으로 밀린다. 스프라이트는 보통
 * 가운데 정렬이라 좌우 대칭이 깨지고 형태가 무너진다. 양쪽에서 고르게 맞춘다.
 */
export function fitRow(row: string, w: number): string {
  if (row.length === w) return row
  if (row.length > w) {
    const extra = row.length - w
    const left = Math.floor(extra / 2)
    return row.slice(left, left + w)
  }
  const missing = w - row.length
  const left = Math.floor(missing / 2)
  return TRANSPARENT_CHAR.repeat(left) + row + TRANSPARENT_CHAR.repeat(missing - left)
}

/**
 * 문자 그리드를 정수배로 확대한다.
 *
 * 문서로 바꿔 리샘플하지 않고 spec 상태에서 처리한다. 문자를 복제하는 것뿐이라
 * 색이 늘지 않고, 팔레트 한도(75색)에도 걸리지 않는다.
 */
export function upscaleRows(rows: string[], factor: number): string[] {
  if (factor <= 1) return rows
  const out: string[] = []
  for (const row of rows) {
    const wide = [...row].map((ch) => ch.repeat(factor)).join('')
    for (let i = 0; i < factor; i++) out.push(wide)
  }
  return out
}

/**
 * 모델에게 시킬 그리드 크기.
 *
 * 64px만 되어도 행마다 64글자를 세어야 해서 모델이 길이를 자주 틀린다.
 * 실측으로 64x64에서 23개 행이 어긋났고 형태가 세 조각으로 갈라졌다.
 * 작게 그리게 하고 정수배로 키우는 편이 훨씬 낫다.
 */
export const MAX_MODEL_SIZE = 32

/** 캔버스 상한. 이 크기까지는 확대로 만들어 준다. */
export const MAX_CANVAS = 256

export type OverlayMode = 'front' | 'behind'

export interface OverlayResult {
  doc: PixelDoc
  /** 빈 자리에 새로 그려진 픽셀 수. */
  added: number
  /** 원본을 덮은 픽셀 수. behind 모드에서는 항상 0. */
  covered: number
  /** 원본의 불투명 픽셀 수. 덮은 비율을 판단하는 기준. */
  baseOpaque: number
}

/**
 * 원본에 덧붙인 결과를 만든다.
 *
 * - behind : 원본이 있는 자리는 무조건 원본. 100% 보존되지만 새 요소가 뒤에
 *            끼워진 것처럼 보인다. 모자가 머리를 덮을 수 없다.
 * - front  : 모델이 그린 자리만 덮는다. 모델은 덧붙일 요소만 그리고 나머지를
 *            투명으로 두도록 지시받으므로, 원본은 그 요소가 가리는 부분만 바뀐다.
 *
 * front 도 통째로 다시 그리는 것과는 다르다. 모델이 투명으로 둔 자리는
 * 원본이 그대로 남는다. 다만 모델이 전체를 칠해 보내면 사실상 덮어쓰기가 되므로,
 * 호출자가 covered 비율을 보고 판단해야 한다.
 */
export function overlay(
  base: PixelDoc,
  addition: PixelDoc,
  mode: OverlayMode = 'behind',
): OverlayResult {
  const doc: PixelDoc = { w: base.w, h: base.h, data: new Uint8ClampedArray(base.data) }
  let added = 0
  let covered = 0
  let baseOpaque = 0

  for (let y = 0; y < base.h; y++) {
    for (let x = 0; x < base.w; x++) {
      const under = getPixel(base, x, y)
      if (under[3] !== 0) baseOpaque++

      const over = getPixel(addition, x, y)
      if (over[3] === 0) continue

      if (under[3] === 0) {
        setPixel(doc, x, y, over)
        added++
      } else if (mode === 'front') {
        setPixel(doc, x, y, over)
        covered++
      }
    }
  }
  return { doc, added, covered, baseOpaque }
}

/**
 * 덮은 비율이 이 값을 넘으면 덧붙이기가 아니라 다시 그린 것으로 본다.
 * 그때는 behind 로 물러나 원본을 지킨다.
 */
export const REDRAW_RATIO = 0.6

/** 색이 spec 한도를 넘으면 줄여서라도 돌려준다. 여기서 던지면 결과를 통째로 잃는다. */
export function toSpecSafe(doc: PixelDoc): { spec: PixelSpec; reduced: boolean } {
  try {
    return { spec: toSpec(doc), reduced: false }
  } catch {
    return {
      spec: toSpec(quantize(doc, { colors: 56, dither: false, alphaThreshold: 128 })),
      reduced: true,
    }
  }
}

const RECOLOR_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
/** 모델에게 보여 줄 색 개수 상한. 많아지면 매핑이 흐트러진다. */
const MAX_RECOLOR_COLORS = 40

export interface RecolorPlan {
  chars: string[]
  colors: RGBA[]
  hexes: string[]
}

/** 문서에서 많이 쓰인 색부터 뽑아 모델에게 보여 줄 목록을 만든다. */
export function planRecolor(doc: PixelDoc): RecolorPlan {
  const used = usedColors(doc).slice(0, MAX_RECOLOR_COLORS)
  const chars: string[] = []
  const colors: RGBA[] = []
  const hexes: string[] = []
  used.forEach((u, i) => {
    const rgba = parseHex(u.hex)
    if (!rgba) return
    chars.push(RECOLOR_CHARS[i])
    colors.push(rgba)
    hexes.push(u.hex)
  })
  return { chars, colors, hexes }
}

/**
 * 모델이 돌려준 팔레트를 매핑으로 바꾼다.
 *
 * 못 알아본 char나 형식이 틀린 hex는 조용히 버리지 않고 원래 색으로 둔다.
 * 빠뜨린 색을 투명이나 검정으로 만들면 그림이 망가진다.
 */
export function buildRecolorMappings(
  plan: RecolorPlan,
  raw: Array<{ char?: string; hex?: string }>,
): { mappings: Array<{ from: RGBA; to: RGBA }>; changed: number; skipped: number } {
  const byChar = new Map<string, string>()
  for (const entry of raw) {
    const char = (entry.char ?? '').trim()
    const hex = (entry.hex ?? '').trim()
    if (char.length !== 1 || !/^#[0-9a-fA-F]{6}$/.test(hex)) continue
    byChar.set(char, hex)
  }

  const mappings: Array<{ from: RGBA; to: RGBA }> = []
  let changed = 0
  let skipped = 0
  plan.chars.forEach((char, i) => {
    const hex = byChar.get(char)
    const next = hex ? parseHex(hex) : null
    if (!next) {
      skipped++
      return
    }
    if (hex!.toLowerCase() === plan.hexes[i].toLowerCase()) return
    mappings.push({ from: plan.colors[i], to: next })
    changed++
  })
  return { mappings, changed, skipped }
}

/** 클라이언트가 보낸 값이므로 모양만 확인하고, 자세한 검증은 fromSpec에 맡긴다. */
function isSpecLike(v: unknown): v is PixelSpec {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.w === 'number' &&
    typeof o.h === 'number' &&
    typeof o.palette === 'object' &&
    o.palette !== null &&
    Array.isArray(o.rows)
  )
}

export function planGeneration(
  w: number,
  h: number,
): { genW: number; genH: number; factor: number } {
  const factor = Math.max(1, Math.ceil(Math.max(w, h) / MAX_MODEL_SIZE))
  return {
    genW: Math.max(8, Math.round(w / factor)),
    genH: Math.max(8, Math.round(h / factor)),
    factor,
  }
}

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
      fixed = fitRow(fixed, w)
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

/** 기존 그림을 모델이 읽을 수 있는 형태로 적는다. */
function describeBase(base: PixelSpec): string {
  const palette = Object.entries(base.palette)
    .filter(([char]) => char !== TRANSPARENT_CHAR)
    .map(([char, hex]) => `  "${char}": "${hex}"`)
    .join('\n')

  return [
    `현재 그림 (${base.w}x${base.h}):`,
    'palette:',
    palette,
    '  "." : 투명',
    'rows:',
    ...base.rows,
  ].join('\n')
}

export type GenerateMode = 'create' | 'edit' | 'add' | 'recolor'

/** 팔레트만 받아온다. 그리드를 요청하지 않으므로 모양이 바뀔 수 없다. */
async function callGeminiPalette(
  config: ServerConfig,
  prompt: string,
  plan: RecolorPlan,
  preview: PixelSpec,
): Promise<Array<{ char?: string; hex?: string }>> {
  const list = plan.chars.map((c, i) => `  "${c}": "${plan.hexes[i]}"`).join('\n')
  const user = [
    '현재 팔레트:',
    list,
    '',
    // 어느 색이 몸통이고 어느 색이 디테일인지 알아야 배합을 제대로 정한다.
    `참고용 그림 (${preview.w}x${preview.h}, 위 char로 표기):`,
    ...preview.rows,
    '',
    `요청: ${prompt}`,
    '위 char를 전부 그대로, hex만 새 색으로 돌려주세요.',
  ].join('\n')

  const out = await generatePalette(config, RECOLOR_INSTRUCTION, user)
  return out.palette
}

async function callGemini(
  config: ServerConfig,
  prompt: string,
  w: number,
  h: number,
  mode: GenerateMode,
  base?: PixelSpec,
): Promise<{ raw: RawResult; retryNote: string | null }> {
  const system =
    base === undefined
      ? SYSTEM_INSTRUCTION
      : mode === 'add'
        ? ADD_INSTRUCTION
        : EDIT_INSTRUCTION

  const user =
    base === undefined
      ? `${w}x${h} 픽셀 아트로 그려주세요: ${prompt}`
      : mode === 'add'
        ? [
            describeBase(base),
            '',
            `위 그림에 덧붙여주세요: ${prompt}`,
            `${w}x${h} 그리드로, 덧붙일 요소만 그리고 나머지는 "." 으로 두세요.`,
          ].join('\n')
        : [
            describeBase(base),
            '',
            `위 그림을 ${w}x${h} 크기로 수정해주세요: ${prompt}`,
            '요청과 무관한 부분은 그대로 두세요.',
          ].join('\n')

  const outcome = await generateGrid({
    config,
    system,
    user,
    w,
    h,
    // 원본을 지켜야 하는 모드는 덜 흔들리게 한다.
    temperature: base === undefined ? 1 : 0.6,
  })
  return { raw: outcome.result, retryNote: outcome.retryNote }
}

/** POST /api/generate 와 GET /api/generate (상태 확인). */
export function createGeminiHandler(config: ServerConfig): ApiHandler {
  return async (req, res, url) => {
    if (url.pathname !== '/api/generate') return false

    if (req.method === 'GET') {
      send(res, 200, { ready: config.apiKey.length > 0, model: config.model })
      return true
    }
    if (req.method !== 'POST') {
      send(res, 405, { error: `${req.method} 는 지원하지 않습니다.` })
      return true
    }

    if (config.apiKey.length === 0) {
      send(res, 503, {
        error:
          'GEMINI_API_KEY 가 설정되지 않았습니다. GEMINI_API_KEY=... 로 서버를 실행하거나 .env 에 채우세요.',
      })
      return true
    }

    try {
      // 수정 모드는 기존 그림을 함께 보내므로 본문이 커진다.
      const parsed = JSON.parse(await readBody(req, 512 * 1024)) as {
        prompt?: unknown
        w?: unknown
        h?: unknown
        base?: unknown
        mode?: unknown
        overlay?: unknown
      }
      const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : ''
      const w = Math.min(MAX_CANVAS, Math.max(8, Number(parsed.w) || 32))
      const h = Math.min(MAX_CANVAS, Math.max(8, Number(parsed.h) || 32))

      if (prompt.length === 0) {
        send(res, 400, { error: '프롬프트가 비어 있습니다.' })
        return true
      }
      if (Number(parsed.w) > MAX_CANVAS || Number(parsed.h) > MAX_CANVAS) {
        send(res, 400, {
          error: `AI 생성은 ${MAX_CANVAS}x${MAX_CANVAS}까지 지원합니다.`,
        })
        return true
      }

      // 큰 캔버스는 모델에게 직접 시키지 않는다. 작게 그리게 하고 정수배로 키운다.
      const { genW, genH, factor } = planGeneration(w, h)

      const mode: GenerateMode =
        parsed.mode === 'edit' || parsed.mode === 'add' || parsed.mode === 'recolor'
          ? parsed.mode
          : 'create'

      // 수정/추가 모드: 기존 그림도 같은 크기로 줄여서 보낸다.
      // 256px 그리드를 그대로 보내면 65,536자라 모델이 읽지도 못한다.
      let base: PixelSpec | undefined
      let baseDoc: PixelDoc | undefined
      if (mode !== 'create' && isSpecLike(parsed.base)) {
        try {
          baseDoc = fromSpec(parsed.base)
          base = toSpec(resample(baseDoc, genW, genH, 'nearest'))
        } catch (err) {
          send(res, 400, {
            error: `보낸 그림을 읽을 수 없습니다: ${err instanceof Error ? err.message : String(err)}`,
          })
          return true
        }
      }
      if (mode !== 'create' && base === undefined) {
        send(res, 400, { error: '이 모드에는 기존 그림이 필요합니다.' })
        return true
      }

      // 색만 바꾸는 모드는 그리드를 아예 요청하지 않는다.
      // 모델에게 그림을 그리게 하면 "색만 바꿔줘"라고 해도 형태가 같이 바뀐다.
      if (mode === 'recolor' && baseDoc !== undefined && base !== undefined) {
        const plan = planRecolor(baseDoc)
        if (plan.chars.length === 0) {
          send(res, 400, { error: '바꿀 색이 없습니다.' })
          return true
        }
        const rawPalette = await callGeminiPalette(config, prompt, plan, base)
        const { mappings, changed, skipped } = buildRecolorMappings(plan, rawPalette)
        if (changed === 0) {
          send(res, 502, { error: '모델이 바꿀 색을 돌려주지 않았습니다. 요청을 더 구체적으로 적어보세요.' })
          return true
        }

        const recolored = replaceColors(baseDoc, mappings, 0)
        const safe = toSpecSafe(recolored.doc)
        const notes = [`${changed}개 색을 바꿨습니다. 모양은 그대로입니다.`]
        if (skipped > 0) notes.push(`${skipped}개 색은 모델이 빠뜨려 원래 값을 유지했습니다.`)
        if (safe.reduced) notes.push('색이 너무 많아 56색으로 줄였습니다.')

        send(res, 200, {
          spec: safe.spec,
          warnings: notes,
          model: config.model,
        } satisfies GenerateResponse)
        return true
      }

      const { raw, retryNote } = await callGemini(config, prompt, genW, genH, mode, base)
      const repaired = repairSpec(raw, genW, genH)
      const warnings = [...repaired.warnings]
      if (retryNote) warnings.push(retryNote)

      let rows = repaired.rows
      if (factor > 1) {
        rows = upscaleRows(rows, factor).map((row) => fitRow(row, w))
        // 반올림 때문에 행 수가 목표와 어긋날 수 있다.
        rows = rows.slice(0, h)
        while (rows.length < h) rows.push(TRANSPARENT_CHAR.repeat(w))
        warnings.push(
          `${genW}x${genH}로 생성해 ${factor}배로 키웠습니다. 모델이 큰 그리드에서는 글자 수를 유지하지 못해 형태가 무너집니다.`,
        )
      }

      let spec: PixelSpec = { w, h, palette: repaired.palette, rows }

      if (mode === 'add' && baseDoc !== undefined) {
        // 원본은 목표 해상도 그대로 쓴다. 축소본을 되키우면 원본이 뭉개진다.
        const full =
          baseDoc.w === w && baseDoc.h === h ? baseDoc : resample(baseDoc, w, h, 'nearest')

        const wanted: OverlayMode = parsed.overlay === 'behind' ? 'behind' : 'front'
        let merged = overlay(full, fromSpec(spec), wanted)

        // 모델이 전체를 칠해 보내면 덧붙이기가 아니라 덮어쓰기다. 원본을 지킨다.
        const ratio = merged.baseOpaque === 0 ? 0 : merged.covered / merged.baseOpaque
        if (wanted === 'front' && ratio > REDRAW_RATIO) {
          merged = overlay(full, fromSpec(spec), 'behind')
          warnings.push(
            `모델이 원본의 ${Math.round(ratio * 100)}%를 덮으려 했습니다. 덧붙이기가 아니라 다시 그린 것으로 보아 원본을 지켰습니다.`,
          )
        } else if (wanted === 'front') {
          warnings.push(
            merged.covered > 0
              ? `${merged.added}픽셀을 더하고 ${merged.covered}픽셀을 덮었습니다 (원본 위).`
              : `${merged.added}픽셀을 빈 자리에 더했습니다.`,
          )
        } else {
          warnings.push(`${merged.added}픽셀을 빈 자리에만 더했습니다. 원본은 그대로입니다.`)
        }

        const safe = toSpecSafe(merged.doc)
        spec = safe.spec
        if (safe.reduced) warnings.push('색이 너무 많아 56색으로 줄였습니다.')
      }

      send(res, 200, { spec, warnings, model: config.model } satisfies GenerateResponse)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[gemini] ${message}`)
      send(res, 502, { error: message })
    }
    return true
  }
}
