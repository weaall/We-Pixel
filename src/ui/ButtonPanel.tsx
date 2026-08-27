import { useMemo, useState } from 'react'
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

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const set = useMemo(() => buttonSet(w, h, tone), [w, h, tone])
  const docs = useMemo(() => set.map((s) => fromSpec(s.spec)), [set])

  const patch = (next: Partial<ButtonTone>) => {
    setTone((t) => ({ ...t, ...next }))
    setPreset('')
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
        <label>가로 {w}</label>
        <input
          className="grow"
          type="range"
          min={MIN_BUTTON_W}
          max={192}
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
          max={96}
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
