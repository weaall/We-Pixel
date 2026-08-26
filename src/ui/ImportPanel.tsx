import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PixelDoc } from '../core/doc'
import { MAX_SIZE, MIN_SIZE } from '../core/doc'
import type { Anchor, CompositeMode } from '../core/compose'
import { anchorOffset, ANCHORS, composite } from '../core/compose'
import { defaultQuantizeOptions, MAX_QUANTIZE_COLORS } from '../core/quantize'
import type { ResampleMode } from '../core/resample'
import type { ImageImportResult } from '../import/imageImport'
import { imageToDoc, isImageFile } from '../import/imageImport'

type Placement = 'replace' | 'front' | 'behind'

const ANCHOR_LABEL: Record<Anchor, string> = {
  'top-left': '좌상단',
  top: '위',
  'top-right': '우상단',
  left: '왼쪽',
  center: '가운데',
  right: '오른쪽',
  'bottom-left': '좌하단',
  bottom: '아래',
  'bottom-right': '우하단',
}

export interface ImportPanelProps {
  /** 현재 캔버스 크기. 기본 목표 크기로 쓴다. */
  width: number
  height: number
  /** 현재 캔버스. 붙이기에서 합성 대상이 된다. */
  doc: PixelDoc
  onApply: (doc: PixelDoc) => void
  /** 스테이지에 파일을 떨어뜨렸을 때 부를 함수를 부모에 등록한다. */
  registerDrop: (fn: ((file: File) => void) | null) => void
}

const SIZE_PRESETS = [16, 32, 48, 64, 96, 128]

export function ImportPanel({ width, height, doc, onApply, registerDrop }: ImportPanelProps) {
  const [file, setFile] = useState<File | null>(null)
  const [targetW, setTargetW] = useState(width)
  const [targetH, setTargetH] = useState(height)
  const [keepAspect, setKeepAspect] = useState(true)
  const [mode, setMode] = useState<ResampleMode>('area')
  const [colors, setColors] = useState(defaultQuantizeOptions.colors)
  const [dither, setDither] = useState(false)
  const [alphaThreshold, setAlphaThreshold] = useState(defaultQuantizeOptions.alphaThreshold)
  const [snapGrid, setSnapGrid] = useState(false)
  const [placement, setPlacement] = useState<Placement>('replace')
  const [anchor, setAnchor] = useState<Anchor>('center')

  const [result, setResult] = useState<ImageImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const fileInput = useRef<HTMLInputElement | null>(null)
  const previewRef = useRef<HTMLCanvasElement | null>(null)

  const pick = useCallback((f: File) => {
    if (!isImageFile(f)) {
      setError(`이미지 파일이 아닙니다: ${f.name}`)
      return
    }
    setError(null)
    setFile(f)
  }, [])

  useEffect(() => {
    registerDrop(pick)
    return () => registerDrop(null)
  }, [registerDrop, pick])

  /**
   * 옵션이 바뀔 때마다 다시 변환한다.
   * 축소 후 크기가 작아 비용이 낮고, 결과를 보고 옵션을 고르는 것이 이 화면의 목적이다.
   */
  useEffect(() => {
    if (file === null) {
      setResult(null)
      return
    }
    let cancelled = false
    setBusy(true)
    void (async () => {
      try {
        const r = await imageToDoc(file, {
          w: targetW,
          h: targetH,
          mode,
          keepAspect,
          colors,
          dither,
          alphaThreshold,
          snapGrid,
        })
        if (!cancelled) {
          setResult(r)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setResult(null)
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [file, targetW, targetH, keepAspect, mode, colors, dither, alphaThreshold, snapGrid])

  /**
   * 실제로 적용될 문서.
   *
   * 붙이기는 캔버스 크기를 유지한다 — 넣으려고 캔버스가 멋대로 커지면
   * 유니티 스프라이트 크기가 어긋난다.
   */
  const applied = useMemo(() => {
    if (result === null) return null
    if (placement === 'replace') return { doc: result.doc, added: 0, covered: 0 }
    const at = anchorOffset(doc, result.doc, anchor)
    const out = composite(doc, result.doc, { mode: placement as CompositeMode, ...at })
    return { doc: out.doc, added: out.added, covered: out.covered }
  }, [result, placement, anchor, doc])

  // 미리보기 렌더
  useEffect(() => {
    const canvas = previewRef.current
    if (canvas === null || applied === null) return
    const doc = applied.doc
    // 패널 폭에 맞춰 정수배로만 확대한다. 보간이 끼면 결과를 잘못 판단하게 된다.
    const scale = Math.max(1, Math.floor(180 / Math.max(doc.w, doc.h)))
    canvas.width = doc.w * scale
    canvas.height = doc.h * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const buf = document.createElement('canvas')
    buf.width = doc.w
    buf.height = doc.h
    buf.getContext('2d')?.putImageData(new ImageData(doc.data, doc.w, doc.h), 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(buf, 0, 0, canvas.width, canvas.height)
  }, [applied])

  const applyPreset = (n: number) => {
    setTargetW(n)
    setTargetH(n)
  }

  return (
    <section className="group">
      <h2>이미지 가져오기</h2>

      <div
        className={`dropzone${dragging ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files[0]
          if (f) pick(f)
        }}
        onClick={() => fileInput.current?.click()}
      >
        {file ? (
          <>
            <strong>{file.name}</strong>
            {result && (
              <span>
                원본 {result.source.w}×{result.source.h} → {result.doc.w}×{result.doc.h}
              </span>
            )}
          </>
        ) : (
          <>
            <strong>이미지를 끌어다 놓기</strong>
            <span>또는 클릭해서 선택 · 캔버스에 바로 떨어뜨려도 됩니다</span>
          </>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) pick(f)
        }}
      />

      {file && (
        <>
          <div className="row" style={{ marginTop: 10 }}>
            <label>배치</label>
            <div className="grow seg">
              {(
                [
                  ['replace', '새 캔버스'],
                  ['front', '원본 위'],
                  ['behind', '원본 뒤'],
                ] as ReadonlyArray<[Placement, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={placement === value ? 'active' : ''}
                  onClick={() => setPlacement(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {placement !== 'replace' && (
            <>
              <div className="row">
                <label>위치</label>
                <div className="anchor-grid">
                  {ANCHORS.map((a) => (
                    <button
                      key={a}
                      className={anchor === a ? 'active' : ''}
                      onClick={() => setAnchor(a)}
                      title={ANCHOR_LABEL[a]}
                      aria-label={ANCHOR_LABEL[a]}
                    />
                  ))}
                </div>
              </div>
              <p className="hint">
                캔버스({doc.w}×{doc.h}) 크기는 유지됩니다. 넘치는 부분은 잘립니다.
              </p>
            </>
          )}

          <div className="row" style={{ marginTop: 10 }}>
            <label>크기</label>
            <input
              className="grow"
              type="number"
              min={MIN_SIZE}
              max={MAX_SIZE}
              value={targetW}
              onChange={(e) => setTargetW(clamp(Number(e.target.value)))}
            />
            <span className="status">×</span>
            <input
              className="grow"
              type="number"
              min={MIN_SIZE}
              max={MAX_SIZE}
              value={targetH}
              onChange={(e) => setTargetH(clamp(Number(e.target.value)))}
            />
          </div>

          <div className="preset-row">
            {SIZE_PRESETS.map((n) => (
              <button
                key={n}
                className={targetW === n && targetH === n ? 'active' : ''}
                onClick={() => applyPreset(n)}
              >
                {n}
              </button>
            ))}
          </div>

          <label className="check" style={{ marginTop: 8 }}>
            <input
              type="checkbox"
              checked={keepAspect}
              onChange={(e) => setKeepAspect(e.target.checked)}
            />
            가로세로 비율 유지
          </label>

          <label className="check" style={{ marginTop: 6 }}>
            <input
              type="checkbox"
              checked={mode === 'nearest'}
              onChange={(e) => setMode(e.target.checked ? 'nearest' : 'area')}
            />
            원본 도트 유지 (확대된 픽셀 아트용)
          </label>

          {result && result.detectedScale > 1 && (
            <label className="check" style={{ marginTop: 6 }}>
              <input
                type="checkbox"
                checked={snapGrid}
                onChange={(e) => setSnapGrid(e.target.checked)}
              />
              {result.strayEdges > 0
                ? `격자에 맞추기 (${result.detectedScale}배, 어긋난 경계 ${result.strayEdges}개)`
                : `격자에 맞추기 (${result.detectedScale}배)`}
            </label>
          )}

          <div className="row" style={{ marginTop: 8 }}>
            <label>색상 {colors}</label>
            <input
              className="grow"
              type="range"
              min={2}
              max={MAX_QUANTIZE_COLORS}
              value={colors}
              onChange={(e) => setColors(Number(e.target.value))}
            />
          </div>

          <div className="row">
            <label>투명 기준 {alphaThreshold}</label>
            <input
              className="grow"
              type="range"
              min={1}
              max={255}
              value={alphaThreshold}
              onChange={(e) => setAlphaThreshold(Number(e.target.value))}
              title="이 값 미만의 알파는 완전 투명이 됩니다"
            />
          </div>

          <label className="check">
            <input type="checkbox" checked={dither} onChange={(e) => setDither(e.target.checked)} />
            디더링 (계조 흉내, 작은 캔버스에선 지저분해짐)
          </label>

          {result && (
            <div className="import-preview">
              <canvas ref={previewRef} />
            </div>
          )}

          {applied && placement !== 'replace' && (
            <p className="hint">
              {applied.covered > 0
                ? `${applied.added}픽셀을 더하고 ${applied.covered}픽셀을 덮습니다.`
                : `${applied.added}픽셀을 빈 자리에 더합니다.`}
            </p>
          )}

          {result?.notes.map((n) => (
            <p className="warn" key={n}>
              {n}
            </p>
          ))}

          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="grow primary"
              onClick={() => applied && onApply(applied.doc)}
              disabled={busy || applied === null}
            >
              {busy
                ? '변환 중…'
                : placement === 'replace'
                  ? '캔버스에 적용'
                  : '캔버스에 붙이기'}
            </button>
            <button onClick={() => setFile(null)} disabled={busy}>
              취소
            </button>
          </div>
          <p className="hint">
            {placement === 'replace'
              ? '적용하면 현재 캔버스를 덮어씁니다. '
              : '현재 그림 위에 합칩니다. '}
            되돌리기로 복구할 수 있습니다.
          </p>
        </>
      )}

      {error && <p className="err">{error}</p>}
    </section>
  )
}

function clamp(v: number): number {
  if (!Number.isFinite(v)) return 32
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.floor(v)))
}
