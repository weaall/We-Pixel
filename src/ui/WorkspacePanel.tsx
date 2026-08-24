import { useCallback, useEffect, useRef, useState } from 'react'
import type { PixelSpec } from '../core/codec'
import { fromSpec, toSpec, TooManyColorsError } from '../core/codec'
import type { PixelDoc } from '../core/doc'
import type { DesignEntry, SpecStore } from '../storage/specStore'
import { detectStore } from '../storage/specStore'

export interface WorkspacePanelProps {
  doc: PixelDoc
  onLoad: (doc: PixelDoc) => void
}

/**
 * 디자인 저장소 브라우저.
 *
 * 서버 API가 있으면 그쪽을 쓴다 — MCP 서버와 같은 폴더라서, 여기서 저장하면
 * Claude의 get_design으로 수정 결과가 보인다.
 * 배포된 서버리스 환경에는 그 API가 없으므로 브라우저 저장소로 넘어간다.
 * 파일 가져오기/내보내기는 두 경우 모두 동작한다.
 */
export function WorkspacePanel({ doc, onLoad }: WorkspacePanelProps) {
  const [store, setStore] = useState<SpecStore | null>(null)
  const [designs, setDesigns] = useState<DesignEntry[]>([])
  const [selected, setSelected] = useState('')
  const [saveName, setSaveName] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)

  const refresh = useCallback(async (s: SpecStore) => {
    setError(null)
    try {
      const list = await s.list()
      setDesigns(list)
      setSelected((prev) => (list.some((d) => d.name === prev) ? prev : (list[0]?.name ?? '')))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const s = await detectStore()
      if (cancelled) return
      setStore(s)
      await refresh(s)
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    setNote(null)
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      if (err instanceof TooManyColorsError) setError(err.message)
      else setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const load = () =>
    run(async () => {
      if (!store || !selected) return
      onLoad(fromSpec(await store.load(selected)))
      setSaveName(selected)
      setNote(`"${selected}" 을 불러왔습니다.`)
    })

  const save = () =>
    run(async () => {
      if (!store) return
      const where = await store.save(saveName.trim(), toSpec(doc))
      setNote(`저장했습니다: ${where}`)
      await refresh(store)
    })

  const remove = () =>
    run(async () => {
      if (!store || !selected) return
      await store.remove(selected)
      setNote(`"${selected}" 을 지웠습니다.`)
      await refresh(store)
    })

  /** 저장소와 무관하게 동작하는 내보내기. 배포판에서 작업물을 챙겨 나가는 수단. */
  const exportFile = () =>
    run(async () => {
      const name = saveName.trim() || selected || 'design'
      const blob = new Blob([JSON.stringify(toSpec(doc), null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${name}.spec.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setNote(`${name}.spec.json 을 내려받았습니다.`)
    })

  const importFile = (file: File) =>
    run(async () => {
      const parsed = JSON.parse(await file.text()) as PixelSpec
      // fromSpec이 행 길이와 미정의 문자를 검증한다. 깨진 파일을 캔버스에 올리지 않는다.
      onLoad(fromSpec(parsed))
      const base = file.name.replace(/\.spec\.json$|\.json$/i, '')
      setSaveName(base)
      setNote(`${file.name} 을 불러왔습니다.`)
    })

  return (
    <section className="group">
      <h2>디자인 저장소 ({designs.length})</h2>

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
        <button onClick={() => store && refresh(store)} title="목록 새로고침" disabled={busy}>
          ↻
        </button>
      </div>

      <div className="row">
        <button className="grow" onClick={load} disabled={busy || selected.length === 0}>
          불러오기
        </button>
        <button
          onClick={remove}
          disabled={busy || selected.length === 0 || store?.kind !== 'browser'}
          title={
            store?.kind === 'browser'
              ? '이 브라우저에서 삭제'
              : '서버 저장소에서는 파일을 직접 지우세요'
          }
        >
          삭제
        </button>
      </div>

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

      <div className="row">
        <button className="grow" onClick={exportFile} disabled={busy}>
          파일로 내보내기
        </button>
        <button className="grow" onClick={() => fileInput.current?.click()} disabled={busy}>
          파일 열기
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          // 같은 파일을 다시 고를 수 있도록 값을 비운다.
          e.target.value = ''
          if (file) void importFile(file)
        }}
      />

      {note && <p className="hint">{note}</p>}
      {error && <p className="err">{error}</p>}

      {store === null ? (
        <p className="hint">저장소 확인 중…</p>
      ) : store.kind === 'server' ? (
        <p className="hint">
          {store.label}
          <br />
          MCP 서버와 같은 폴더입니다. 여기서 저장하면 Claude 쪽 <code>get_design</code> 으로
          수정 결과가 보입니다.
        </p>
      ) : (
        <p className="hint">
          {store.label}
          <br />
          배포 환경에는 서버 저장소가 없어 이 브라우저에만 남습니다. 다른 기기에서 쓰려면
          파일로 내보내세요.
        </p>
      )}
    </section>
  )
}
