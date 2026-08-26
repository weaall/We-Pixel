import { useEffect, useMemo, useState } from 'react'
import type { PixelSpec } from '../core/codec'
import { fromSpec, toSpec, TooManyColorsError } from '../core/codec'
import { contentBounds } from '../core/doc'
import type { PixelDoc } from '../core/doc'
import { quantize } from '../core/quantize'
import { resample } from '../core/resample'

export interface AiPanelProps {
  width: number
  height: number
  /** 현재 캔버스. 수정 모드에서 모델에게 보낸다. */
  doc: PixelDoc
  onGenerate: (doc: PixelDoc) => void
}

interface Status {
  ready: boolean
  model: string
}

type Mode = 'create' | 'edit' | 'add'

/**
 * 기본 명령어. 프롬프트를 처음부터 쓰지 않아도 되게 한다.
 *
 * 모드마다 다른 것을 제시해야 한다 — "모자 씌우기"는 추가이고
 * "색을 바꾸기"는 수정이다.
 */
const PRESETS: Record<Mode, ReadonlyArray<string>> = {
  create: ['고블린 전사', '체력 물약', '나무 상자', '돌 블록 타일', '검', '슬라임'],
  edit: ['몸 색을 빨갛게', '화난 표정으로', '외곽선을 더 어둡게', '명암을 뚜렷하게'],
  add: ['모자 씌우기', '무기 들려주기', '발밑에 그림자', '망토 달기', '뿔 달기', '눈 추가'],
}

/** AI 생성 한계. */
const MAX_AI_SIZE = 256

/**
 * 모델에게 보낼 기존 그림의 최대 크기.
 *
 * 서버가 다시 한 번 생성 크기에 맞춰 줄이지만, 여기서 먼저 줄여야
 * 256x256 그리드(65,536자)가 통째로 네트워크를 타지 않는다.
 */
const MAX_BASE_SIZE = 64
const MAX_BASE_COLORS = 40

export function AiPanel(props: AiPanelProps) {
  const [mode, setMode] = useState<Mode>('create')
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/generate')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((s: Status) => {
        if (!cancelled) setStatus(s)
      })
      .catch(() => {
        if (!cancelled) setStatus({ ready: false, model: '' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const empty = useMemo(() => contentBounds(props.doc) === null, [props.doc])
  const tooLarge = props.width > MAX_AI_SIZE || props.height > MAX_AI_SIZE

  /** 현재 캔버스를 보낼 수 있는 크기/색으로 줄여 spec으로 만든다. */
  const buildBase = (): PixelSpec => {
    const factor = Math.max(1, Math.ceil(Math.max(props.doc.w, props.doc.h) / MAX_BASE_SIZE))
    let doc =
      factor === 1
        ? props.doc
        : resample(
            props.doc,
            Math.max(8, Math.round(props.doc.w / factor)),
            Math.max(8, Math.round(props.doc.h / factor)),
            'nearest',
          )
    try {
      return toSpec(doc)
    } catch (err) {
      if (!(err instanceof TooManyColorsError)) throw err
      // 사진에서 가져온 그림은 색이 많아 spec으로 담기지 않는다.
      // 보내기 위한 사본만 줄인다. 캔버스는 건드리지 않는다.
      doc = quantize(doc, { colors: MAX_BASE_COLORS, dither: false, alphaThreshold: 128 })
      return toSpec(doc)
    }
  }

  const run = async () => {
    setError(null)
    setWarnings([])
    setBusy(true)
    try {
      const body: Record<string, unknown> = { prompt, w: props.width, h: props.height, mode }
      if (mode !== 'create') body.base = buildBase()

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = (await res.json()) as {
        spec?: PixelSpec
        warnings?: string[]
        error?: string
      }
      if (!res.ok || !payload.spec) {
        throw new Error(payload.error ?? `HTTP ${res.status}`)
      }
      props.onGenerate(fromSpec(payload.spec))
      setWarnings(payload.warnings ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const editUnavailable = mode !== 'create' && empty
  const disabled =
    busy || prompt.trim().length === 0 || status?.ready === false || tooLarge || editUnavailable

  return (
    <section className="group">
      <h2>
        AI
        {status?.model && (
          // h2에 uppercase가 걸려 있어 모델명이 대문자로 뭉개진다. 여기서만 해제한다.
          <span style={{ textTransform: 'none', opacity: 0.75 }}> · {status.model}</span>
        )}
      </h2>

      <div className="seg">
        <button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>
          새로 그리기
        </button>
        <button className={mode === 'add' ? 'active' : ''} onClick={() => setMode('add')}>
          덧붙이기
        </button>
        <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>
          고치기
        </button>
      </div>

      <div className="preset-chips">
        {PRESETS[mode].map((text) => (
          <button key={text} onClick={() => setPrompt(text)} disabled={status?.ready === false}>
            {text}
          </button>
        ))}
      </div>

      <textarea
        style={{ marginTop: 8 }}
        placeholder={
          mode === 'create'
            ? '그릴 대상을 적으세요.\n예: 초록 고블린 전사, 정면, 손에 곤봉'
            : mode === 'add'
              ? '덧붙일 것을 적으세요.\n예: 모자를 씌워줘 / 손에 검을 들려줘'
              : '무엇을 바꿀지 적으세요.\n예: 몸을 빨갛게 / 화난 표정으로'
        }
        value={prompt}
        spellCheck={false}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={status?.ready === false}
      />

      <button
        className="primary"
        style={{ width: '100%', marginTop: 8 }}
        onClick={run}
        disabled={disabled}
      >
        {busy
          ? { create: '그리는 중…', add: '덧붙이는 중…', edit: '고치는 중…' }[mode]
          : `${props.width}×${props.height} 로 ${{ create: '생성', add: '덧붙이기', edit: '고치기' }[mode]}`}
      </button>

      {status?.ready === false && (
        <p className="warn">
          API 키가 없습니다. <code>GEMINI_API_KEY</code> 를 설정한 뒤 서버를 다시 시작하세요.
        </p>
      )}
      {editUnavailable && <p className="warn">캔버스가 비어 있어 수정할 그림이 없습니다.</p>}
      {tooLarge && (
        <p className="warn">
          AI는 {MAX_AI_SIZE}×{MAX_AI_SIZE} 까지입니다.
        </p>
      )}
      {warnings.map((w) => (
        <p className="warn" key={w}>
          {w}
        </p>
      ))}
      {error && <p className="err">{error}</p>}
      <p className="hint">
        {mode === 'create' && '생성하면 현재 캔버스를 덮어씁니다. '}
        {mode === 'add' &&
          '기존 그림이 있는 자리는 서버가 그대로 지킵니다. 모델이 전체를 다시 그려 보내도 빈 자리에만 반영됩니다. '}
        {mode === 'edit' &&
          '현재 그림을 보내 고칩니다. 유지하도록 지시하지만 모델이 다시 그릴 수도 있습니다 — 원본을 지켜야 하면 덧붙이기를 쓰세요. '}
        되돌리기로 복구할 수 있습니다.
      </p>
    </section>
  )
}
