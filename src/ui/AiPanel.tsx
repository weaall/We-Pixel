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

type Mode = 'create' | 'edit'

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
      const body: Record<string, unknown> = { prompt, w: props.width, h: props.height }
      if (mode === 'edit') body.base = buildBase()

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

  const editUnavailable = mode === 'edit' && empty
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
        <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>
          현재 그림 수정
        </button>
      </div>

      <textarea
        style={{ marginTop: 8 }}
        placeholder={
          mode === 'create'
            ? '그릴 대상을 적으세요.\n예: 초록 고블린 전사, 정면, 손에 곤봉'
            : '무엇을 바꿀지 적으세요.\n예: 모자를 씌워줘 / 몸을 빨갛게 / 화난 표정으로'
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
          ? mode === 'create'
            ? '그리는 중…'
            : '고치는 중…'
          : `${props.width}×${props.height} 로 ${mode === 'create' ? '생성' : '수정'}`}
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
        {mode === 'create'
          ? '생성하면 현재 캔버스를 덮어씁니다.'
          : '현재 그림을 모델에게 보내고 받은 결과로 덮어씁니다. 요청과 무관한 부분은 유지하도록 지시하지만, 모델이 다시 그릴 수도 있습니다.'}{' '}
        되돌리기로 복구할 수 있습니다.
      </p>
    </section>
  )
}
