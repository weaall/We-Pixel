import { useEffect, useState } from 'react'
import type { PixelSpec } from '../core/codec'
import { fromSpec } from '../core/codec'
import type { PixelDoc } from '../core/doc'

export interface AiPanelProps {
  width: number
  height: number
  onGenerate: (doc: PixelDoc) => void
}

interface Status {
  ready: boolean
  model: string
}

/** AI 생성 한계. 이보다 크면 모델이 행 길이를 유지하지 못한다. */
const MAX_AI_SIZE = 64

export function AiPanel(props: AiPanelProps) {
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

  const tooLarge = props.width > MAX_AI_SIZE || props.height > MAX_AI_SIZE

  const generate = async () => {
    setError(null)
    setWarnings([])
    setBusy(true)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, w: props.width, h: props.height }),
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

  return (
    <section className="group">
      <h2>
        AI 생성
        {status?.model && (
          // h2에 uppercase가 걸려 있어 모델명이 대문자로 뭉개진다. 여기서만 해제한다.
          <span style={{ textTransform: 'none', opacity: 0.75 }}> · {status.model}</span>
        )}
      </h2>

      <textarea
        placeholder={'그릴 대상을 적으세요.\n예: 초록 고블린 전사, 정면, 손에 곤봉'}
        value={prompt}
        spellCheck={false}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={status?.ready === false}
      />

      <button
        className="primary"
        style={{ width: '100%', marginTop: 8 }}
        onClick={generate}
        disabled={busy || prompt.trim().length === 0 || status?.ready === false || tooLarge}
      >
        {busy ? '그리는 중…' : `${props.width}×${props.height} 로 생성`}
      </button>

      {status?.ready === false && (
        <p className="warn">
          API 키가 없습니다. <code>.env.example</code> 을 <code>.env</code> 로 복사하고{' '}
          <code>GEMINI_API_KEY</code> 를 채운 뒤 개발 서버를 다시 시작하세요.
        </p>
      )}
      {tooLarge && (
        <p className="warn">
          AI 생성은 {MAX_AI_SIZE}×{MAX_AI_SIZE} 까지입니다. 생성 후 크기를 늘리세요.
        </p>
      )}
      {warnings.map((w) => (
        <p className="warn" key={w}>
          {w}
        </p>
      ))}
      {error && <p className="err">{error}</p>}
      <p className="hint">
        생성하면 현재 캔버스를 덮어씁니다. 되돌리기로 복구할 수 있습니다.
      </p>
    </section>
  )
}
