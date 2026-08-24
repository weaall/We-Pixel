import { useCallback, useEffect, useState } from 'react'
import type { PixelSpec } from '../core/codec'
import { fromSpec, toSpec, TooManyColorsError } from '../core/codec'
import type { PixelDoc } from '../core/doc'

export interface WorkspacePanelProps {
  doc: PixelDoc
  onLoad: (doc: PixelDoc) => void
}

interface DesignEntry {
  name: string
  size: string
  colors: number
  modified: string
}

/**
 * MCP 서버와 공유하는 작업 폴더 브라우저.
 * MCP로 그린 디자인을 여기서 열어 픽셀을 고치고 다시 저장하면,
 * MCP의 get_design으로 그 수정이 보인다.
 */
export function WorkspacePanel({ doc, onLoad }: WorkspacePanelProps) {
  const [designs, setDesigns] = useState<DesignEntry[]>([])
  const [root, setRoot] = useState('')
  const [selected, setSelected] = useState('')
  const [saveName, setSaveName] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/designs')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const payload = (await res.json()) as { root: string; designs: DesignEntry[] }
      setDesigns(payload.designs)
      setRoot(payload.root)
      setSelected((prev) => prev || (payload.designs[0]?.name ?? ''))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const load = async () => {
    if (!selected) return
    setError(null)
    setNote(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/designs/${encodeURIComponent(selected)}`)
      const payload = (await res.json()) as { spec?: PixelSpec; error?: string }
      if (!res.ok || !payload.spec) throw new Error(payload.error ?? `HTTP ${res.status}`)
      onLoad(fromSpec(payload.spec))
      setSaveName(selected)
      setNote(`"${selected}" 을 불러왔습니다.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    const name = saveName.trim()
    if (name.length === 0) return
    setError(null)
    setNote(null)
    setBusy(true)
    try {
      const spec = toSpec(doc)
      const res = await fetch(`/api/designs/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ spec }),
      })
      const payload = (await res.json()) as { path?: string; error?: string }
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`)
      setNote(`저장했습니다: ${payload.path}`)
      await refresh()
    } catch (err) {
      if (err instanceof TooManyColorsError) setError(err.message)
      else setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="group">
      <h2>작업 폴더 ({designs.length})</h2>

      <div className="row">
        <select
          className="grow"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={designs.length === 0}
        >
          {designs.length === 0 && <option value="">비어 있음</option>}
          {designs.map((d) => (
            <option key={d.name} value={d.name}>
              {d.name} · {d.size} · {d.colors}색
            </option>
          ))}
        </select>
        <button onClick={refresh} title="목록 새로고침" disabled={busy}>
          ↻
        </button>
      </div>

      <button
        style={{ width: '100%' }}
        onClick={load}
        disabled={busy || selected.length === 0}
      >
        불러오기
      </button>

      <div className="row" style={{ marginTop: 10 }}>
        <input
          className="grow"
          type="text"
          placeholder="저장할 이름"
          value={saveName}
          spellCheck={false}
          onChange={(e) => setSaveName(e.target.value)}
        />
        <button onClick={save} disabled={busy || saveName.trim().length === 0}>
          저장
        </button>
      </div>

      {note && <p className="hint">{note}</p>}
      {error && <p className="err">{error}</p>}
      {root && <p className="hint">{root}</p>}
      <p className="hint">
        MCP 서버와 같은 폴더입니다. 여기서 저장하면 Claude 쪽 <code>get_design</code> 으로
        수정 결과가 보입니다.
      </p>
    </section>
  )
}
