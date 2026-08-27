import { useMemo, useState } from 'react'
import type { PixelSpec } from '../core/codec'
import { fromSpec } from '../core/codec'
import type { PixelDoc } from '../core/doc'
import type { DiceTone, DiceToneOptions } from '../core/generate/diceSet'
import { DICE_PRESETS, diceTonedPalette, makeDiceSetToned } from '../core/generate/diceSet'
import { defaultActionSpec } from '../export/csharp'
import { buildPackage } from '../export/package'
import { docToPngBlob, downloadBlob } from '../export/png'
import { defaultImportOptions } from '../export/unityMeta'
import type { DiceTop } from '../core/generate/diceSet'
import { defaultRollOptions, makeRoll, rollSheetItems } from '../core/generate/diceRoll'
import { DocThumb } from './DocThumb'
import { RollPreview } from './RollPreview'

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

  const [result, setResult] = useState<DiceTop>(6)
  const [frameCount, setFrameCount] = useState(defaultRollOptions.frames)
  const [bounces, setBounces] = useState(defaultRollOptions.bounces)
  const [fps, setFps] = useState(12)

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
  const exportPackage = async (
    items: ReadonlyArray<{ name: string; doc: PixelDoc }>,
    assetName: string,
    columns?: number,
  ) => {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const res = await buildPackage({
        doc: items[0].doc,
        sheet: items,
        sheetColumns: columns,
        assetName,
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

  /**
   * 굴러가는 칸. 세트와 같은 배색을 쓴다.
   *
   * 큐브를 실제로 회전시키지는 않는다. 회전은 참고 그림에 들어 있지 않은
   * 정보다 — 여섯 장 모두 실루엣이 같고 눈만 다르다. 눈이 빠르게 바뀌며 튀다가
   * 결과에 멈추는 연출이고, 픽셀 게임에서 실제로 쓰는 방식이다.
   */
  const roll = useMemo(
    () =>
      makeRoll({
        ...defaultRollOptions,
        result,
        frames: frameCount,
        bounces,
        palette: diceTonedPalette({ body, pip }),
      }),
    [result, frameCount, bounces, body, pip],
  )

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
          onClick={() =>
            exportPackage(
              set.map((d) => ({ name: `${preset || '주사위'}_${d.top}`, doc: d.doc })),
              `${preset || 'Dice'}Set`,
            )
          }
          data-tip="여섯 장을 한 텍스처로 묶고 .meta 에 칸 정보를 넣습니다"
        >
          유니티 시트
        </button>
      </div>

      <hr className="sep" />

      <h3 className="sub">굴리기</h3>
      <RollPreview frames={roll.map((f) => f.doc)} fps={fps} box={72} />

      <div className="row">
        <label>결과 {result}</label>
        <div className="grow seg">
          {([1, 2, 3, 4, 5, 6] as DiceTop[]).map((n) => (
            <button key={n} className={result === n ? 'active' : ''} onClick={() => setResult(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="row">
        <label>칸 {frameCount}</label>
        <input
          className="grow"
          type="range"
          min={4}
          max={24}
          value={frameCount}
          onChange={(e) => setFrameCount(Number(e.target.value))}
        />
        <label>튀기 {bounces}</label>
        <input
          className="grow"
          type="range"
          min={1}
          max={6}
          value={bounces}
          onChange={(e) => setBounces(Number(e.target.value))}
        />
      </div>

      <div className="row">
        <label>속도 {fps}fps</label>
        <input
          className="grow"
          type="range"
          min={4}
          max={30}
          value={fps}
          onChange={(e) => setFps(Number(e.target.value))}
        />
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="grow"
          disabled={busy}
          onClick={() =>
            exportPackage(
              rollSheetItems(roll, `${preset || '주사위'}Roll`),
              `${preset || 'Dice'}Roll`,
              Math.min(8, roll.length),
            )
          }
          data-tip="굴리는 칸을 한 텍스처로 묶습니다"
        >
          굴리기 시트
        </button>
      </div>
      <p className="hint">
        큐브를 실제로 회전시키지는 않습니다. 눈이 빠르게 바뀌며 튀다가 결과에
        멈추는 연출입니다 — 참고 그림 여섯 장은 실루엣이 모두 같아 회전 정보가
        들어 있지 않습니다.
      </p>
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
