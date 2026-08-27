import { useMemo, useState } from 'react'
import type { PixelSpec } from '../core/codec'
import { fromSpec } from '../core/codec'
import type { PixelDoc } from '../core/doc'
import type { ButtonTone } from '../core/generate/button'
import { BUTTON_PRESETS } from '../core/generate/button'
import { BUTTON_BORDER } from '../core/generate/buttonFrame'
import type { Kit } from '../core/generate/kit'
import { defaultKitSizes, kitFromTone } from '../core/generate/kit'
import { defaultActionSpec } from '../export/csharp'
import { buildPackage } from '../export/package'
import { docToPngBlob, downloadBlob } from '../export/png'
import { defaultImportOptions } from '../export/unityMeta'
import { DocThumb } from './DocThumb'

export interface KitPanelProps {
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

interface Piece {
  name: string
  doc: PixelDoc
  family: 'dice' | 'ui' | 'panel'
}

function pieces(kit: Kit, label: string): Piece[] {
  return [
    ...kit.dice.map((d) => ({
      name: `${label} 주사위 ${d.kind === 'iso' ? '' : '정면 '}${d.top}`,
      doc: fromSpec(d.spec),
      family: 'dice' as const,
    })),
    ...kit.button.map((b) => ({
      name: `${label} 버튼 ${STATE_LABEL[b.state] ?? b.state}`,
      doc: fromSpec(b.spec),
      family: 'ui' as const,
    })),
    { name: `${label} 패널`, doc: fromSpec(kit.panel), family: 'panel' as const },
  ]
}

/**
 * 키트 한 벌을 만든다.
 *
 * 주사위와 버튼을 따로 뽑으면 색이 안 맞는다. 톤 하나 또는 컨셉 하나에서
 * 전부 나와야 한 세계의 물건으로 보인다.
 */
export function KitPanel(props: KitPanelProps) {
  const [preset, setPreset] = useState(BUTTON_PRESETS[0].name)
  const [tone, setTone] = useState<ButtonTone>(BUTTON_PRESETS[0].tone)
  const [concept, setConcept] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  /** 모델이 준 키트. 있으면 톤 대신 이것을 보여 준다. */
  const [fromAi, setFromAi] = useState<{ label: string; kit: Kit } | null>(null)

  const local = useMemo(() => kitFromTone(tone), [tone])
  const kit = fromAi?.kit ?? local
  const label = fromAi?.label ?? preset ?? '키트'
  const items = useMemo(() => pieces(kit, label), [kit, label])

  const patch = (next: Partial<ButtonTone>) => {
    setTone((t) => ({ ...t, ...next }))
    setPreset('')
    setFromAi(null)
  }

  const runAi = async () => {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'kit',
          prompt: concept.trim(),
          w: defaultKitSizes.button.w,
          h: defaultKitSizes.button.h,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? `요청 실패 (${res.status})`)
      const next: Kit = {
        dice: body.dice ?? [],
        button: body.states ?? [],
        panel: body.panel as PixelSpec,
      }
      if (next.dice.length === 0 || next.button.length === 0) {
        throw new Error('돌려받은 배색이 없습니다.')
      }
      setFromAi({ label: (body.name as string) || concept.trim(), kit: next })
      setNote(
        Array.isArray(body.warnings) && body.warnings.length > 0
          ? body.warnings.join(' ')
          : '배색을 받았습니다. 아래에서 확인하고 내보내세요.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const exportKit = async () => {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const dice = items.filter((p) => p.family === 'dice')
      const ui = items.filter((p) => p.family === 'ui')
      const panel = items.filter((p) => p.family === 'panel')
      const border = {
        left: BUTTON_BORDER.left,
        right: BUTTON_BORDER.right,
        top: BUTTON_BORDER.top,
        bottom: BUTTON_BORDER.bottom,
      }

      const res = await buildPackage({
        doc: dice[0].doc,
        // 주사위는 정사각이라 따로 묶는다. 크기가 다른 것을 한 텍스처에 섞으면
        // 9-슬라이스 테두리가 엉뚱한 자리를 가리킨다.
        sheet: dice.map((p, i) => ({ name: `Dice_${i < 6 ? '' : 'F'}${(i % 6) + 1}`, doc: p.doc })),
        assetName: `${label}Dice`,
        extraSheets: [
          {
            assetName: `${label}Button`,
            items: ui.map((p, i) => ({ name: `Button_${['normal', 'hover', 'pressed', 'disabled'][i]}`, doc: p.doc })),
            border,
          },
          {
            assetName: `${label}Panel`,
            items: panel.map((p) => ({ name: 'Panel', doc: p.doc })),
            border,
          },
        ],
        action: defaultActionSpec,
        unity: defaultImportOptions,
        includePostprocessor: true,
        includeSpec: true,
        previewScale: 0,
        encodePng: docToPngBlob,
      })
      downloadBlob(new Blob([res.bytes], { type: 'application/zip' }), res.filename)
      setNote(res.warnings.join(' '))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="group">
      <h2>UI 키트</h2>

      <div className="variant-strip">
        {items.map((p) => (
          <figure key={p.name}>
            <DocThumb doc={p.doc} box={p.family === 'dice' ? 48 : 72} />
            <figcaption>{p.name.replace(`${label} `, '')}</figcaption>
          </figure>
        ))}
      </div>

      <p className="hint">
        주사위와 버튼을 따로 뽑으면 색이 안 맞습니다. 여기서는 톤 하나 또는 컨셉
        하나에서 전부 나옵니다.
      </p>

      <div className="row">
        <input
          className="grow"
          type="text"
          value={concept}
          placeholder="던전, 숲, 얼음 성, 해적선..."
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
          data-tip="주사위와 버튼 색을 한 번에 받습니다. 형태는 그대로입니다"
        >
          {busy ? '받는 중...' : '컨셉으로'}
        </button>
      </div>

      <hr className="sep" />

      <div className="row">
        <div className="grow seg wrap">
          {BUTTON_PRESETS.map((p) => (
            <button
              key={p.name}
              className={preset === p.name && fromAi === null ? 'active' : ''}
              onClick={() => {
                setPreset(p.name)
                setTone(p.tone)
                setFromAi(null)
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
              items.map((p) => p.doc),
              label,
              items.map((p) => p.name),
            )
          }
        >
          새 페이지 {items.length}장
        </button>
        <button
          className="grow"
          disabled={busy}
          onClick={exportKit}
          data-tip="주사위·버튼·패널을 각각 텍스처로 묶어 한 패키지에 담습니다"
        >
          유니티 패키지
        </button>
      </div>
      {note !== null && <p className="hint">{note}</p>}
      {error !== null && <p className="hint error">{error}</p>}
    </section>
  )
}
