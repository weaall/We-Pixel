import { useMemo, useState } from 'react'
import type { PixelDoc } from '../core/doc'
import type { DiceMaterial } from '../core/generate/dice'
import { defaultDiceOptions, generateDice, randomPips } from '../core/generate/dice'
import { defaultPatternOptions, generatePattern } from '../core/generate/pattern'
import { randomSeed, resolveSeed } from '../core/generate/rng'
import type { SpriteShape } from '../core/generate/sprite'
import { defaultSpriteOptions, generateSprite } from '../core/generate/sprite'
import type { Variant } from '../core/generate/variants'
import { defaultVariantSetOptions, makeVariants } from '../core/generate/variants'
import { DocThumb } from './DocThumb'

type Mode = 'sprite' | 'pattern' | 'dice' | 'variant'

export interface GeneratePanelProps {
  width: number
  height: number
  /** 색 변형의 원본. 지금 캔버스에 있는 그림을 그대로 쓴다. */
  doc: PixelDoc
  onGenerate: (doc: PixelDoc) => void
  /** 만든 변형을 새 페이지로 펼친다. */
  onGenerateMany: (docs: ReadonlyArray<PixelDoc>) => void
}

export function GeneratePanel(props: GeneratePanelProps) {
  const [mode, setMode] = useState<Mode>('sprite')
  const [seed, setSeed] = useState('1000')
  const [hue, setHue] = useState(defaultSpriteOptions.hue)

  const [density, setDensity] = useState(defaultSpriteOptions.density)
  const [mirrorX, setMirrorX] = useState(defaultSpriteOptions.mirrorX)
  const [outline, setOutline] = useState(defaultSpriteOptions.outline)
  const [shading, setShading] = useState(defaultSpriteOptions.shading)
  const [accent, setAccent] = useState(defaultSpriteOptions.accent)
  const [shape, setShape] = useState<SpriteShape>(defaultSpriteOptions.shape ?? 'blob')

  const [steps, setSteps] = useState(defaultPatternOptions.steps)
  const [detail, setDetail] = useState(defaultPatternOptions.detail)
  const [seamless, setSeamless] = useState(defaultPatternOptions.seamless)

  const [material, setMaterial] = useState<DiceMaterial>(defaultDiceOptions.material)
  const [speckle, setSpeckle] = useState(defaultDiceOptions.speckle)
  /** 눈을 시드에서 뽑을지, 직접 정할지. */
  const [autoPips, setAutoPips] = useState(true)
  const [pipTop, setPipTop] = useState(1)

  const [count, setCount] = useState(defaultVariantSetOptions.count)
  const [step, setStep] = useState(defaultVariantSetOptions.step)
  const [saturation, setSaturation] = useState(defaultVariantSetOptions.saturation)
  const [contrast, setContrast] = useState(defaultVariantSetOptions.contrast)
  const [brightness, setBrightness] = useState(defaultVariantSetOptions.brightness)
  const [keepNeutral, setKeepNeutral] = useState(defaultVariantSetOptions.keepNeutral)

  /**
   * 미리보기와 실제 결과가 같은 함수에서 나와야 한다.
   * 따로 계산하면 슬라이더를 맞춰 놓고 눌렀을 때 다른 것이 나온다.
   */
  const variants = useMemo(
    () =>
      mode === 'variant'
        ? makeVariants(props.doc, {
            count,
            hue,
            step,
            saturation,
            contrast,
            brightness,
            keepNeutral,
          })
        : [],
    [mode, props.doc, count, hue, step, saturation, contrast, brightness, keepNeutral],
  )

  const run = (seedText: string) => {
    const s = resolveSeed(seedText)
    const doc =
      mode === 'dice'
        ? generateDice({
            // 등축 큐브라 정사각 캔버스여야 잘리지 않는다.
            size: Math.min(props.width, props.height),
            seed: s,
            hue,
            material,
            speckle,
            outline: true,
            pips: autoPips ? randomPips(s) : [pipTop, ((pipTop + 1) % 6) + 1, ((pipTop + 3) % 6) + 1],
          })
        : mode === 'sprite'
        ? generateSprite({
            w: props.width,
            h: props.height,
            seed: s,
            hue,
            density,
            mirrorX,
            outline,
            shading,
            accent,
            shape,
          })
        : generatePattern({
            w: props.width,
            h: props.height,
            seed: s,
            hue,
            steps,
            detail,
            octaves: defaultPatternOptions.octaves,
            seamless,
          })
    props.onGenerate(doc)
  }

  const reroll = () => {
    const next = String(randomSeed())
    setSeed(next)
    run(next)
  }

  return (
    <section className="group">
      <h2>자동 생성</h2>

      <div className="row">
        <button
          className={`grow${mode === 'sprite' ? ' active' : ''}`}
          onClick={() => setMode('sprite')}
        >
          스프라이트
        </button>
        <button
          className={`grow${mode === 'pattern' ? ' active' : ''}`}
          onClick={() => setMode('pattern')}
        >
          무늬 / 타일
        </button>
        <button
          className={`grow${mode === 'dice' ? ' active' : ''}`}
          onClick={() => setMode('dice')}
        >
          주사위
        </button>
        <button
          className={`grow${mode === 'variant' ? ' active' : ''}`}
          onClick={() => setMode('variant')}
        >
          색 변형
        </button>
      </div>

      {mode !== 'variant' && (
        <div className="row">
          <label>시드</label>
          <input
            className="grow"
            type="text"
            value={seed}
            spellCheck={false}
            onChange={(e) => setSeed(e.target.value)}
            title="숫자 또는 아무 단어. 같은 시드면 항상 같은 결과가 나옵니다."
          />
        </div>
      )}

      <div className="row">
        <label>{mode === 'variant' ? '첫 색조' : '색조'} {Math.round(hue)}°</label>
        <input
          className="grow"
          type="range"
          min={0}
          max={360}
          value={hue}
          onChange={(e) => setHue(Number(e.target.value))}
        />
      </div>

      {mode === 'variant' ? (
        <VariantControls
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
      ) : mode === 'dice' ? (
        <>
          <div className="row">
            <label>재질</label>
            <div className="grow seg">
              {(
                [
                  ['stone', '돌'],
                  ['metal', '금속'],
                  ['wood', '나무'],
                  ['gem', '보석'],
                ] as ReadonlyArray<[DiceMaterial, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={material === value ? 'active' : ''}
                  onClick={() => setMaterial(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <label>잡티 {speckle.toFixed(2)}</label>
            <input
              className="grow"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={speckle}
              onChange={(e) => setSpeckle(Number(e.target.value))}
            />
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={autoPips}
              onChange={(e) => setAutoPips(e.target.checked)}
            />
            눈을 시드에서 뽑기
          </label>

          {!autoPips && (
            <div className="row" style={{ marginTop: 6 }}>
              <label>윗면 {pipTop}</label>
              <input
                className="grow"
                type="range"
                min={1}
                max={6}
                value={pipTop}
                onChange={(e) => setPipTop(Number(e.target.value))}
              />
            </div>
          )}

          <p className="hint">
            마주보는 면의 합은 7이라, 보이는 세 면은 (1,6) (2,5) (3,4)에서 하나씩입니다.
            색조와 재질만 바꾸면 같은 형태로 다른 주사위가 나옵니다.
          </p>
        </>
      ) : mode === 'sprite' ? (
        <>
          <div className="row">
            <label>체형</label>
            <div className="grow seg">
              {([
                ['blob', '보통'],
                ['tall', '길쭉'],
                ['wide', '납작'],
              ] as ReadonlyArray<[SpriteShape, string]>).map(([value, label]) => (
                <button
                  key={value}
                  className={shape === value ? 'active' : ''}
                  onClick={() => setShape(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <label>밀도 {density.toFixed(2)}</label>
            <input
              className="grow"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={density}
              onChange={(e) => setDensity(Number(e.target.value))}
            />
          </div>
          <div className="row">
            <label className="check">
              <input
                type="checkbox"
                checked={mirrorX}
                onChange={(e) => setMirrorX(e.target.checked)}
              />
              좌우 대칭
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={outline}
                onChange={(e) => setOutline(e.target.checked)}
              />
              외곽선
            </label>
          </div>
          <div className="row">
            <label className="check">
              <input
                type="checkbox"
                checked={shading}
                onChange={(e) => setShading(e.target.checked)}
              />
              명암
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={accent}
                onChange={(e) => setAccent(e.target.checked)}
              />
              포인트 색
            </label>
          </div>
        </>
      ) : (
        <>
          <div className="row">
            <label>단계 {steps}</label>
            <input
              className="grow"
              type="range"
              min={2}
              max={8}
              value={steps}
              onChange={(e) => setSteps(Number(e.target.value))}
            />
          </div>
          <div className="row">
            <label>디테일 {detail.toFixed(1)}</label>
            <input
              className="grow"
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={detail}
              onChange={(e) => setDetail(Number(e.target.value))}
            />
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={seamless}
              onChange={(e) => setSeamless(e.target.checked)}
            />
            이음선 없는 타일
          </label>
        </>
      )}

      {mode === 'variant' ? (
        <>
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
        </>
      ) : (
        <>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="grow primary" onClick={() => run(seed)}>
              생성
            </button>
            <button className="grow" onClick={reroll}>
              새 시드
            </button>
          </div>
          <p className="hint">
            생성하면 현재 캔버스를 덮어씁니다. 되돌리기로 복구할 수 있습니다.
          </p>
        </>
      )}
    </section>
  )
}

interface VariantControlsProps {
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
