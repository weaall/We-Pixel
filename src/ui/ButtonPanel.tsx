import { useMemo, useState } from 'react'
import type { PixelSpec } from '../core/codec'
import { fromSpec } from '../core/codec'
import type { PixelDoc } from '../core/doc'
import type { ButtonTone } from '../core/generate/button'
import {
  BUTTON_PRESETS,
  BUTTON_STATES,
  MIN_BUTTON_H,
  MIN_BUTTON_W,
  buttonSet,
} from '../core/generate/button'
import { BUTTON_BORDER } from '../core/generate/buttonFrame'
import { defaultActionSpec } from '../export/csharp'
import { buildPackage } from '../export/package'
import { docToPngBlob, downloadBlob } from '../export/png'
import { defaultImportOptions } from '../export/unityMeta'
import { DocThumb } from './DocThumb'

export interface ButtonPanelProps {
  onGenerateMany: (
    docs: ReadonlyArray<PixelDoc>,
    prefix?: string,
    names?: ReadonlyArray<string>,
  ) => void
}

/**
 * 자주 쓰는 크기.
 *
 * 세로로도 늘어나므로 같은 한 장이 버튼도 되고 패널도 된다. 창틀은 세로가 길다.
 */
const SIZES: ReadonlyArray<{ name: string; w: number; h: number }> = [
  { name: '버튼', w: 64, h: 32 },
  { name: '넓은 버튼', w: 128, h: 32 },
  { name: '작은 칸', w: 32, h: 32 },
  { name: '패널', w: 160, h: 96 },
  { name: '창틀', w: 128, h: 160 },
]

const STATE_LABEL: Record<string, string> = {
  normal: '기본',
  hover: '올림',
  pressed: '눌림',
  disabled: '꺼짐',
}

/**
 * 버튼을 만든다.
 *
 * 9-슬라이스라 한 장으로 어떤 크기든 나온다. 32/64/96 을 따로 들고 갈 필요가
 * 없고, 유니티에서도 spriteBorder 덕에 한 스프라이트가 모든 크기를 감당한다.
 */
export function ButtonPanel(props: ButtonPanelProps) {
  const [w, setW] = useState(64)
  const [h, setH] = useState(32)
  const [preset, setPreset] = useState(BUTTON_PRESETS[0].name)
  const [tone, setTone] = useState<ButtonTone>(BUTTON_PRESETS[0].tone)

  const [concept, setConcept] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const set = useMemo(() => buttonSet(w, h, tone), [w, h, tone])
  const docs = useMemo(() => set.map((s) => fromSpec(s.spec)), [set])

  const patch = (next: Partial<ButtonTone>) => {
    setTone((t) => ({ ...t, ...next }))
    setPreset('')
  }

  /**
   * 컨셉 하나로 배색을 받는다.
   *
   * 모델에게는 형태를 돌려줄 방법 자체가 없다 — 응답 스키마에 rows 가 없다.
   * 자리 이름만 알려주고 색만 받는다.
   */
  const runAi = async () => {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'buttonset', prompt: concept.trim(), w, h }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? `요청 실패 (${res.status})`)
      const states = (body.states ?? []) as Array<{ state: string; spec: PixelSpec }>
      if (states.length === 0) throw new Error('돌려받은 배색이 없습니다.')
      const label = (body.name as string) || concept.trim()
      props.onGenerateMany(
        states.map((it) => fromSpec(it.spec)),
        label,
        states.map((it) => `${label} ${STATE_LABEL[it.state] ?? it.state}`),
      )
      if (Array.isArray(body.warnings) && body.warnings.length > 0) {
        setNote(body.warnings.join(' '))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const exportSheet = async () => {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const label = preset || '버튼'
      const res = await buildPackage({
        doc: docs[0],
        sheet: set.map((s, i) => ({ name: `${label}_${s.state}`, doc: docs[i] })),
        assetName: `${label}Button`,
        action: defaultActionSpec,
        unity: {
          ...defaultImportOptions,
          // 이것이 없으면 유니티가 통째로 늘려 둥근 모서리가 뭉개진다.
          border: {
            left: BUTTON_BORDER.left,
            right: BUTTON_BORDER.right,
            top: BUTTON_BORDER.top,
            bottom: BUTTON_BORDER.bottom,
          },
        },
        includePostprocessor: true,
        includeSpec: true,
        previewScale: 0,
        encodePng: docToPngBlob,
      })
      downloadBlob(new Blob([res.bytes], { type: 'application/zip' }), res.filename)
      setNote(res.warnings.join(' ') || `${res.filename} 을 내려받았습니다.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="group">
      <h2>버튼</h2>

      <div className="variant-strip">
        {set.map((s, i) => (
          <figure key={s.state}>
            <DocThumb doc={docs[i]} box={Math.min(120, Math.max(w, h))} />
            <figcaption>{STATE_LABEL[s.state]}</figcaption>
          </figure>
        ))}
      </div>

      <p className="hint">
        9-슬라이스라 한 장으로 어떤 크기든 나옵니다. 가장자리 {BUTTON_BORDER.left}px 는
        늘리지 않고 그대로 두고 가운데만 늘립니다 — 통째로 늘리면 둥근 모서리가
        뭉개집니다.
      </p>

      <div className="row">
        <div className="grow seg wrap">
          {SIZES.map((p) => (
            <button
              key={p.name}
              className={w === p.w && h === p.h ? 'active' : ''}
              onClick={() => {
                setW(p.w)
                setH(p.h)
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="row">
        <label>가로 {w}</label>
        <input
          className="grow"
          type="range"
          min={MIN_BUTTON_W}
          max={256}
          value={w}
          onChange={(e) => setW(Number(e.target.value))}
        />
      </div>

      <div className="row">
        <label>세로 {h}</label>
        <input
          className="grow"
          type="range"
          min={MIN_BUTTON_H}
          max={192}
          value={h}
          onChange={(e) => setH(Number(e.target.value))}
        />
      </div>

      <div className="row">
        <div className="grow seg wrap">
          {BUTTON_PRESETS.map((p) => (
            <button
              key={p.name}
              className={preset === p.name ? 'active' : ''}
              onClick={() => {
                setPreset(p.name)
                setTone(p.tone)
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="row">
        <label className="tone-label">색</label>
        <input
          className="grow"
          type="range"
          min={0}
          max={360}
          value={tone.hue}
          onChange={(e) => patch({ hue: Number(e.target.value) })}
          data-tip={`색조 ${Math.round(tone.hue)}도`}
        />
        <input
          className="grow"
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={tone.saturationBoost}
          onChange={(e) => patch({ saturationBoost: Number(e.target.value) })}
          data-tip={`선명하게 ${tone.saturationBoost.toFixed(2)}`}
        />
        <input
          className="grow"
          type="range"
          min={-0.3}
          max={0.3}
          step={0.02}
          value={tone.brightness}
          onChange={(e) => patch({ brightness: Number(e.target.value) })}
          data-tip={`밝기 ${tone.brightness > 0 ? '+' : ''}${tone.brightness.toFixed(2)}`}
        />
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <input
          className="grow"
          type="text"
          value={concept}
          placeholder="나무, 돌, 황금, 유리..."
          onChange={(e) => setConcept(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy && concept.trim() !== '') runAi()
            e.stopPropagation()
          }}
        />
        <button
          className="primary"
          disabled={busy || concept.trim() === ''}
          onClick={runAi}
          data-tip="컨셉에 맞는 배색을 AI가 정합니다. 형태는 그대로입니다"
        >
          {busy ? '받는 중...' : '컨셉으로'}
        </button>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="grow primary"
          onClick={() =>
            props.onGenerateMany(
              docs,
              preset || '버튼',
              BUTTON_STATES.map((s) => `${preset || '버튼'} ${STATE_LABEL[s]}`),
            )
          }
        >
          새 페이지 4장
        </button>
        <button
          className="grow"
          disabled={busy}
          onClick={exportSheet}
          data-tip="네 상태를 묶고 .meta 에 9-슬라이스 정보를 넣습니다"
        >
          유니티 시트
        </button>
      </div>
      {note !== null && <p className="hint">{note}</p>}
      {error !== null && <p className="hint error">{error}</p>}
      <p className="hint">
        유니티에서는 한 스프라이트가 모든 크기를 감당합니다. Image 를 Sliced 로 두면
        가장자리를 지킨 채 늘어납니다.
      </p>
    </section>
  )
}
