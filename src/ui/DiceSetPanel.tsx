import { useMemo, useState } from 'react'
import type { PixelSpec } from '../core/codec'
import { fromSpec } from '../core/codec'
import type { PixelDoc } from '../core/doc'
import type { DiceTone, DiceToneOptions } from '../core/generate/diceSet'
import { DICE_PRESETS, makeDiceSetToned } from '../core/generate/diceSet'
import { defaultActionSpec } from '../export/csharp'
import { buildPackage } from '../export/package'
import { docToPngBlob, downloadBlob } from '../export/png'
import { defaultImportOptions } from '../export/unityMeta'
import { DocThumb } from './DocThumb'

export interface DiceSetPanelProps {
  onGenerateMany: (
    docs: ReadonlyArray<PixelDoc>,
    prefix?: string,
    names?: ReadonlyArray<string>,
  ) => void
}

/**
 * 주사위 세트를 만든다.
 *
 * 형태는 구워 둔 프레임이라 캔버스가 필요 없다. 컨셉을 적으면 모델이 배색을
 * 정하고, 여섯 개가 그 배색 하나를 함께 쓴다 — 그래야 세트로 보인다.
 */
export function DiceSetPanel(props: DiceSetPanelProps) {
  /**
   * 몸통과 눈을 따로 둔다. 하나로 묶으면 색조를 옮길 때 붉은 눈이 몸통을 따라
   * 끌려가 "돌 몸통에 붉은 눈" 같은 조합을 만들 수 없다.
   */
  const [body, setBody] = useState<DiceTone>(DICE_PRESETS[0].tone.body)
  const [pip, setPip] = useState<DiceTone>(DICE_PRESETS[0].tone.pip)
  const [preset, setPreset] = useState(DICE_PRESETS[0].name)

  const [concept, setConcept] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  /**
   * 여섯 장을 한 텍스처로 묶어 내보낸다.
   *
   * 따로 내보내면 유니티에서 면을 바꿀 때마다 다른 스프라이트를 참조해야 해서
   * 굴리는 연출을 짜기 번거롭다. 시트 한 장이면 인덱스만 바꾸면 된다.
   */
  const exportSheet = async () => {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const label = preset || '주사위'
      const res = await buildPackage({
        doc: set[0].doc,
        sheet: set.map((d) => ({ name: `${label}_${d.top}`, doc: d.doc })),
        assetName: `${label}Dice`,
        action: defaultActionSpec,
        unity: defaultImportOptions,
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

  const set = useMemo(() => makeDiceSetToned({ body, pip }), [body, pip])

  const applyPreset = (p: { name: string; tone: DiceToneOptions }) => {
    setPreset(p.name)
    setBody(p.tone.body)
    setPip(p.tone.pip)
  }

  const push = (docs: ReadonlyArray<PixelDoc>, label: string) => {
    props.onGenerateMany(
      docs,
      label,
      docs.map((_, i) => `${label} ${i + 1}`),
    )
  }

  const runAi = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'diceset', prompt: concept.trim() }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? `요청 실패 (${res.status})`)
      const dice = (body.dice ?? []) as Array<{ top: number; spec: PixelSpec }>
      if (dice.length === 0) throw new Error('돌려받은 주사위가 없습니다.')
      const label = (body.name as string) || concept.trim()
      props.onGenerateMany(
        dice.map((d) => fromSpec(d.spec)),
        label,
        dice.map((d) => `${label} ${d.top}`),
      )
      if (Array.isArray(body.warnings) && body.warnings.length > 0) {
        setError(body.warnings.join(' '))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="group">
      <h2>주사위 세트</h2>

      <div className="variant-strip">
        {set.map((d) => (
          <figure key={d.top}>
            <DocThumb doc={d.doc} box={56} />
            <figcaption>{d.pips.join('·')}</figcaption>
          </figure>
        ))}
      </div>

      <p className="hint">
        윗면이 1~6인 여섯 개가 한 벌입니다. 아래 숫자는 보이는 세 면(위·왼쪽·오른쪽)이고,
        마주보는 면의 합은 7입니다.
      </p>

      <div className="row">
        <div className="grow seg wrap">
          {DICE_PRESETS.map((p) => (
            <button
              key={p.name}
              className={preset === p.name ? 'active' : ''}
              onClick={() => applyPreset(p)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <input
          className="grow"
          type="text"
          value={concept}
          placeholder="불꽃, 얼음, 뼈, 황금..."
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
          data-tip="컨셉에 맞는 배색을 AI가 정하고, 여섯 개가 그 배색을 함께 씁니다"
        >
          {busy ? '받는 중...' : '세트 생성'}
        </button>
      </div>
      {error !== null && <p className="hint error">{error}</p>}

      <hr className="sep" />

      <ToneControls label="몸통" tone={body} onChange={(t) => { setBody(t); setPreset('') }} />
      <ToneControls label="눈" tone={pip} onChange={(t) => { setPip(t); setPreset('') }} />

      <div className="row" style={{ marginTop: 10 }}>
        <button className="grow" onClick={() => push(set.map((d) => d.doc), preset || '주사위')}>
          이 색으로 6장
        </button>
        <button
          className="grow"
          disabled={busy}
          onClick={exportSheet}
          data-tip="여섯 장을 한 텍스처로 묶고 .meta 에 칸 정보를 넣습니다"
        >
          유니티 시트
        </button>
      </div>
      {note !== null && <p className="hint">{note}</p>}
      <p className="hint">
        AI 없이 색조만 돌려서도 만들 수 있습니다. 형태는 어느 쪽이든 구워 둔
        프레임 그대로입니다.
      </p>
    </section>
  )
}

interface ToneControlsProps {
  label: string
  tone: DiceTone
  onChange: (tone: DiceTone) => void
}

function ToneControls({ label, tone, onChange }: ToneControlsProps) {
  const set = (patch: Partial<DiceTone>) => onChange({ ...tone, ...patch })

  return (
    <>
      <div className="row">
        <label className="tone-label">{label}</label>
        <input
          className="grow"
          type="range"
          min={0}
          max={360}
          value={tone.hue}
          onChange={(e) => set({ hue: Number(e.target.value) })}
          data-tip={`색조 ${Math.round(tone.hue)}도`}
        />
        <input
          className="grow"
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={tone.saturationBoost}
          onChange={(e) => set({ saturationBoost: Number(e.target.value) })}
          data-tip={`선명하게 ${tone.saturationBoost.toFixed(2)} — 회색에는 배율이 듣지 않습니다`}
        />
        <input
          className="grow"
          type="range"
          min={-0.3}
          max={0.3}
          step={0.02}
          value={tone.brightness}
          onChange={(e) => set({ brightness: Number(e.target.value) })}
          data-tip={`밝기 ${tone.brightness > 0 ? '+' : ''}${tone.brightness.toFixed(2)}`}
        />
      </div>
    </>
  )
}
