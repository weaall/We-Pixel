import { useMemo, useState } from 'react'
import type { PixelSpec } from '../core/codec'
import { fromSpec, toSpec } from '../core/codec'
import type { PixelDoc } from '../core/doc'
import type { Variant } from '../core/generate/variants'
import { defaultVariantSetOptions, makeVariants } from '../core/generate/variants'
import { DocThumb } from './DocThumb'

export interface GeneratePanelProps {
  /** 색 변형의 원본. 지금 캔버스에 있는 그림을 그대로 쓴다. */
  doc: PixelDoc
  /** 만든 변형을 새 페이지로 펼친다. */
  onGenerateMany: (
    docs: ReadonlyArray<PixelDoc>,
    prefix?: string,
    names?: ReadonlyArray<string>,
  ) => void
  onGenerate: (doc: PixelDoc) => void
}

/**
 * 이미 그린 그림의 배색만 바꿔 여러 벌을 뽑는다.
 *
 * 형태를 만들어 내지는 않는다. 절차적으로 그린 그림은 사람이 그린 것과 같아질
 * 수 없고, 색만 바꾸는 쪽은 형태가 유지된다는 것을 코드로 보장할 수 있다.
 */
export function GeneratePanel(props: GeneratePanelProps) {
  const [hue, setHue] = useState(defaultVariantSetOptions.hue)
  const [count, setCount] = useState(defaultVariantSetOptions.count)
  const [step, setStep] = useState(defaultVariantSetOptions.step)
  const [saturation, setSaturation] = useState(defaultVariantSetOptions.saturation)
  const [contrast, setContrast] = useState(defaultVariantSetOptions.contrast)
  const [brightness, setBrightness] = useState(defaultVariantSetOptions.brightness)
  const [keepNeutral, setKeepNeutral] = useState(defaultVariantSetOptions.keepNeutral)

  /** 가상 생성: 프레임은 잠근 채 배색만 모델에게 받는다. */
  const [theme, setTheme] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * 미리보기와 실제 결과가 같은 함수에서 나와야 한다.
   * 따로 계산하면 슬라이더를 맞춰 놓고 눌렀을 때 다른 것이 나온다.
   */
  const variants = useMemo(
    () =>
      makeVariants(props.doc, {
        count,
        hue,
        step,
        saturation,
        contrast,
        brightness,
        keepNeutral,
      }),
    [props.doc, count, hue, step, saturation, contrast, brightness, keepNeutral],
  )

  const runVirtual = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'virtual',
          prompt: theme.trim(),
          count,
          w: props.doc.w,
          h: props.doc.h,
          base: toSpec(props.doc),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? `요청 실패 (${res.status})`)
      const list = (body.variants ?? []) as Array<{ name?: string; spec: PixelSpec }>
      if (list.length === 0) throw new Error('돌려받은 배색이 없습니다.')
      props.onGenerateMany(
        list.map((v) => fromSpec(v.spec)),
        '가상',
        list.map((v) => v.name ?? ''),
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
      <h2>색 변형</h2>

      <div className="row">
        <label>첫 색조 {Math.round(hue)}°</label>
        <input
          className="grow"
          type="range"
          min={0}
          max={360}
          value={hue}
          onChange={(e) => setHue(Number(e.target.value))}
        />
      </div>

      <VariantControls
        theme={theme}
        setTheme={setTheme}
        busy={busy}
        error={error}
        onVirtual={runVirtual}
        variants={variants}
        count={count}
        setCount={setCount}
        step={step}
        setStep={setStep}
        saturation={saturation}
        setSaturation={setSaturation}
        contrast={contrast}
        setContrast={setContrast}
        brightness={brightness}
        setBrightness={setBrightness}
        keepNeutral={keepNeutral}
        setKeepNeutral={setKeepNeutral}
      />

      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="grow primary"
          disabled={variants.length === 0}
          onClick={() => props.onGenerateMany(variants.map((v) => v.doc))}
        >
          새 페이지 {variants.length}장
        </button>
        <button
          className="grow"
          disabled={variants.length === 0}
          onClick={() => props.onGenerate(variants[0].doc)}
        >
          여기에 적용
        </button>
      </div>
      <p className="hint">
        팔레트만 바꾸므로 형태는 한 픽셀도 달라지지 않습니다. 지금 캔버스에 있는
        그림이 원본입니다.
      </p>
    </section>
  )
}

interface VariantControlsProps {
  theme: string
  setTheme: (v: string) => void
  busy: boolean
  error: string | null
  onVirtual: () => void
  variants: ReadonlyArray<Variant>
  count: number
  setCount: (v: number) => void
  step: number
  setStep: (v: number) => void
  saturation: number
  setSaturation: (v: number) => void
  contrast: number
  setContrast: (v: number) => void
  brightness: number
  setBrightness: (v: number) => void
  keepNeutral: boolean
  setKeepNeutral: (v: boolean) => void
}

function VariantControls(p: VariantControlsProps) {
  const empty = p.variants.every((v) => v.doc.data.every((b, i) => i % 4 !== 3 || b === 0))

  return (
    <>
      {/* 슬라이더를 만지는 동안 결과가 바로 보여야 어느 조합인지 고를 수 있다. */}
      <div className="variant-strip">
        {p.variants.map((v) => (
          <figure key={v.hue}>
            <DocThumb doc={v.doc} box={64} />
            <figcaption>{Math.round(v.hue)}°</figcaption>
          </figure>
        ))}
      </div>

      {empty && <p className="hint">캔버스가 비어 있습니다. 먼저 그림을 그리거나 불러오세요.</p>}

      {/* 색조를 손으로 돌리는 대신 어떤 느낌인지만 적는다. 형태는 어느 쪽이든 잠겨 있다. */}
      <div className="row">
        <input
          className="grow"
          type="text"
          value={p.theme}
          placeholder="불꽃, 얼음, 독, 황금..."
          onChange={(e) => p.setTheme(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !p.busy && p.theme.trim() !== '') p.onVirtual()
            e.stopPropagation()
          }}
        />
        <button
          disabled={p.busy || empty || p.theme.trim() === ''}
          onClick={p.onVirtual}
          data-tip="형태는 그대로 두고 어울리는 배색만 AI에게 받습니다"
        >
          {p.busy ? '받는 중...' : '가상 생성'}
        </button>
      </div>
      {p.error !== null && <p className="hint error">{p.error}</p>}

      <div className="row">
        <label>개수 {p.count}</label>
        <input
          className="grow"
          type="range"
          min={1}
          max={8}
          value={p.count}
          onChange={(e) => p.setCount(Number(e.target.value))}
        />
      </div>

      <div className="row">
        <label>{p.step === 0 ? '간격 고르게' : `간격 ${p.step}°`}</label>
        <input
          className="grow"
          type="range"
          min={0}
          max={120}
          step={5}
          value={p.step}
          onChange={(e) => p.setStep(Number(e.target.value))}
          title="0이면 360°를 개수만큼 고르게 나눕니다. 올리면 비슷한 색끼리 묶입니다."
        />
      </div>

      <div className="row">
        <label>채도 {p.saturation.toFixed(2)}</label>
        <input
          className="grow"
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={p.saturation}
          onChange={(e) => p.setSaturation(Number(e.target.value))}
        />
      </div>

      <div className="row">
        <label>명암 {p.contrast.toFixed(2)}</label>
        <input
          className="grow"
          type="range"
          min={0.2}
          max={2}
          step={0.05}
          value={p.contrast}
          onChange={(e) => p.setContrast(Number(e.target.value))}
        />
      </div>

      <div className="row">
        <label>밝기 {p.brightness > 0 ? '+' : ''}{p.brightness.toFixed(2)}</label>
        <input
          className="grow"
          type="range"
          min={-0.3}
          max={0.3}
          step={0.02}
          value={p.brightness}
          onChange={(e) => p.setBrightness(Number(e.target.value))}
        />
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={p.keepNeutral}
          onChange={(e) => p.setKeepNeutral(e.target.checked)}
        />
        외곽선·회색은 그대로 두기
      </label>
    </>
  )
}
