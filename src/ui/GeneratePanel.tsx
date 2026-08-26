import { useState } from 'react'
import type { PixelDoc } from '../core/doc'
import { defaultPatternOptions, generatePattern } from '../core/generate/pattern'
import { randomSeed, resolveSeed } from '../core/generate/rng'
import type { SpriteShape } from '../core/generate/sprite'
import { defaultSpriteOptions, generateSprite } from '../core/generate/sprite'

type Mode = 'sprite' | 'pattern'

export interface GeneratePanelProps {
  width: number
  height: number
  onGenerate: (doc: PixelDoc) => void
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

  const run = (seedText: string) => {
    const s = resolveSeed(seedText)
    const doc =
      mode === 'sprite'
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
      </div>

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

      {mode === 'sprite' ? (
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
    </section>
  )
}
