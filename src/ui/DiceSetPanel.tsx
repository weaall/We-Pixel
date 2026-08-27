import { useMemo, useState } from 'react'
import type { PixelSpec } from '../core/codec'
import { fromSpec } from '../core/codec'
import type { PixelDoc } from '../core/doc'
import { makeDiceSet } from '../core/generate/diceSet'
import { defaultVariantOptions } from '../core/generate/variants'
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
  const [hue, setHue] = useState(defaultVariantOptions.hue)
  const [saturation, setSaturation] = useState(defaultVariantOptions.saturation)
  const [contrast, setContrast] = useState(defaultVariantOptions.contrast)
  const [brightness, setBrightness] = useState(defaultVariantOptions.brightness)

  const [concept, setConcept] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = useMemo(
    () =>
      makeDiceSet({
        ...defaultVariantOptions,
        hue,
        saturation,
        contrast,
        brightness,
        // 주사위는 외곽선도 몸통 색을 따라가야 세트로 보인다.
        keepNeutral: false,
      }),
    [hue, saturation, contrast, brightness],
  )

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

      <div className="row">
        <label>색조 {Math.round(hue)}°</label>
        <input
          className="grow"
          type="range"
          min={0}
          max={360}
          value={hue}
          onChange={(e) => setHue(Number(e.target.value))}
        />
      </div>

      <div className="row">
        <label>채도 {saturation.toFixed(2)}</label>
        <input
          className="grow"
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={saturation}
          onChange={(e) => setSaturation(Number(e.target.value))}
        />
      </div>

      <div className="row">
        <label>명암 {contrast.toFixed(2)}</label>
        <input
          className="grow"
          type="range"
          min={0.2}
          max={2}
          step={0.05}
          value={contrast}
          onChange={(e) => setContrast(Number(e.target.value))}
        />
      </div>

      <div className="row">
        <label>
          밝기 {brightness > 0 ? '+' : ''}
          {brightness.toFixed(2)}
        </label>
        <input
          className="grow"
          type="range"
          min={-0.3}
          max={0.3}
          step={0.02}
          value={brightness}
          onChange={(e) => setBrightness(Number(e.target.value))}
        />
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <button className="grow" onClick={() => push(set.map((d) => d.doc), '주사위')}>
          이 색으로 6장
        </button>
      </div>
      <p className="hint">
        AI 없이 색조만 돌려서도 만들 수 있습니다. 형태는 어느 쪽이든 구워 둔
        프레임 그대로입니다.
      </p>
    </section>
  )
}
