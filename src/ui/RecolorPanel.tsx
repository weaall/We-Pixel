import { useEffect, useMemo, useRef, useState } from 'react'
import { usedColors } from '../core/codec'
import type { RGBA } from '../core/color'
import { parseHex, toHex, toHexRGB } from '../core/color'
import type { PixelDoc } from '../core/doc'
import { countMatches, replaceColor } from '../core/recolor'

export interface RecolorPanelProps {
  doc: PixelDoc
  /** 현재 선택된 그리기 색. 교체 대상 색의 초기값으로 쓴다. */
  current: RGBA
  palette: string[]
  onApply: (doc: PixelDoc) => void
}

const TRANSPARENT: RGBA = [0, 0, 0, 0]

export function RecolorPanel({ doc, current, palette, onApply }: RecolorPanelProps) {
  const used = useMemo(() => usedColors(doc), [doc])
  const [from, setFrom] = useState<RGBA | null>(null)
  const [to, setTo] = useState<RGBA>(current)
  const [tolerance, setTolerance] = useState(0)
  const previewRef = useRef<HTMLCanvasElement | null>(null)

  // 문서가 바뀌면(다른 그림을 불러오는 등) 선택이 남아 있으면 안 된다.
  useEffect(() => {
    setFrom(null)
  }, [doc])

  // 가장 많이 쓰인 색을 기본 선택으로. 아무것도 안 고른 상태로 두면 한 번 더 클릭해야 한다.
  useEffect(() => {
    if (from !== null || used.length === 0) return
    setFrom(parseHex(used[0].hex))
  }, [used, from])

  const result = useMemo(
    () => (from === null ? null : replaceColor(doc, from, to, tolerance)),
    [doc, from, to, tolerance],
  )
  const affected = useMemo(
    () => (from === null ? 0 : countMatches(doc, from, tolerance)),
    [doc, from, tolerance],
  )

  // 결과 미리보기
  useEffect(() => {
    const canvas = previewRef.current
    if (canvas === null || result === null) return
    const scale = Math.max(1, Math.floor(150 / Math.max(doc.w, doc.h)))
    canvas.width = doc.w * scale
    canvas.height = doc.h * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const buf = document.createElement('canvas')
    buf.width = doc.w
    buf.height = doc.h
    buf.getContext('2d')?.putImageData(new ImageData(result.doc.data, doc.w, doc.h), 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(buf, 0, 0, canvas.width, canvas.height)
  }, [result, doc.w, doc.h])

  const fromHex = from === null ? null : toHex(from)
  const hasTransparent = useMemo(() => {
    for (let i = 3; i < doc.data.length; i += 4) if (doc.data[i] === 0) return true
    return false
  }, [doc])

  if (used.length === 0 && !hasTransparent) {
    return <p className="hint">캔버스가 비어 있습니다.</p>
  }

  return (
    <section className="group">
      <h2>바꿀 색</h2>
      <div className="swatches">
        {used.map((u) => (
          <button
            key={u.hex}
            className={`swatch${fromHex === u.hex ? ' selected' : ''}`}
            style={{ background: u.hex }}
            title={`${u.hex} — ${u.count}px`}
            onClick={() => setFrom(parseHex(u.hex))}
          />
        ))}
        {hasTransparent && (
          <button
            className={`swatch transparent${from?.[3] === 0 ? ' selected' : ''}`}
            title="투명 영역"
            onClick={() => setFrom(TRANSPARENT)}
          />
        )}
      </div>
      <p className="hint">
        {from === null
          ? '색을 고르세요.'
          : from[3] === 0
            ? '투명 영역을 선택했습니다.'
            : `${fromHex} 선택됨`}
      </p>

      <div className="divider" />

      <h2>바꿀 결과</h2>
      <input
        type="color"
        value={toHexRGB(to)}
        onChange={(e) => {
          const rgba = parseHex(e.target.value)
          // <input type="color">는 알파를 다루지 못하므로 기존 알파를 유지한다.
          if (rgba) setTo([rgba[0], rgba[1], rgba[2], to[3] === 0 ? 255 : to[3]])
        }}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <label>알파 {to[3]}</label>
        <input
          className="grow"
          type="range"
          min={0}
          max={255}
          value={to[3]}
          onChange={(e) => setTo([to[0], to[1], to[2], Number(e.target.value)])}
        />
      </div>
      <div className="row">
        <button className="grow" onClick={() => setTo(current)}>
          현재 색
        </button>
        <button className="grow" onClick={() => setTo(TRANSPARENT)}>
          투명 (지우기)
        </button>
      </div>

      <div className="swatches" style={{ marginTop: 8 }}>
        {palette.map((hex, i) => (
          <button
            key={`${hex}-${i}`}
            className={`swatch${toHex(to) === hex ? ' selected' : ''}`}
            style={{ background: hex }}
            title={hex}
            onClick={() => {
              const rgba = parseHex(hex)
              if (rgba) setTo(rgba)
            }}
          />
        ))}
      </div>

      <div className="divider" />

      <div className="row">
        <label>허용 오차 {tolerance}</label>
        <input
          className="grow"
          type="range"
          min={0}
          max={96}
          value={tolerance}
          onChange={(e) => setTolerance(Number(e.target.value))}
          disabled={from?.[3] === 0}
          title="0이면 정확히 같은 색만 바꿉니다"
        />
      </div>
      <p className="hint">
        0이 기본입니다. 올리면 비슷한 색까지 함께 바뀌므로 명암 단계가 뭉개질 수 있습니다.
        사진에서 가져온 그림에만 쓰세요.
      </p>

      {result && (
        <div className="import-preview">
          <canvas ref={previewRef} />
        </div>
      )}

      {affected === 0 ? (
        <p className="warn">해당하는 픽셀이 없습니다.</p>
      ) : (
        <p className="hint">
          {affected.toLocaleString()}픽셀이 바뀝니다 (
          {((affected / (doc.w * doc.h)) * 100).toFixed(1)}%).
        </p>
      )}

      <button
        className="primary"
        style={{ width: '100%', marginTop: 8 }}
        disabled={from === null || affected === 0 || result === null}
        onClick={() => result && onApply(result.doc)}
      >
        교체
      </button>
      <p className="hint">되돌리기로 복구할 수 있습니다.</p>
    </section>
  )
}
