import { useEffect, useMemo, useRef, useState } from 'react'
import { usedColors } from '../core/codec'
import type { RGBA } from '../core/color'
import { parseHex, toHexRGB } from '../core/color'
import type { PixelDoc } from '../core/doc'
import type { ColorMapping } from '../core/recolor'
import { replaceColors } from '../core/recolor'

export interface RecolorPanelProps {
  doc: PixelDoc
  /** 현재 선택된 그리기 색. 행마다 "현재 색"으로 찍을 때 쓴다. */
  current: RGBA
  palette: string[]
  onApply: (doc: PixelDoc) => void
}

const TRANSPARENT: RGBA = [0, 0, 0, 0]
const TRANSPARENT_KEY = 'transparent'

interface Row {
  /** 원본 색 식별자. 투명은 별도 키를 쓴다. */
  key: string
  from: RGBA
  count: number
}

export function RecolorPanel({ doc, current, palette, onApply }: RecolorPanelProps) {
  const rows = useMemo<Row[]>(() => {
    const list: Row[] = usedColors(doc).map((u) => ({
      key: u.hex,
      from: parseHex(u.hex) ?? TRANSPARENT,
      count: u.count,
    }))
    let clear = 0
    for (let i = 3; i < doc.data.length; i += 4) if (doc.data[i] === 0) clear++
    if (clear > 0) list.push({ key: TRANSPARENT_KEY, from: TRANSPARENT, count: clear })
    return list
  }, [doc])

  /** 원본 키 -> 바꿀 색. 손대지 않은 행은 여기에 없다. */
  const [targets, setTargets] = useState<Record<string, RGBA>>({})
  const [tolerance, setTolerance] = useState(0)
  const previewRef = useRef<HTMLCanvasElement | null>(null)

  // 다른 그림을 불러오면 지정해 둔 매핑은 의미가 없다.
  useEffect(() => {
    setTargets({})
  }, [doc])

  const mappings = useMemo<ColorMapping[]>(
    () =>
      rows
        .filter((r) => targets[r.key] !== undefined)
        .map((r) => ({ from: r.from, to: targets[r.key] })),
    [rows, targets],
  )

  const result = useMemo(
    () => replaceColors(doc, mappings, tolerance),
    [doc, mappings, tolerance],
  )

  useEffect(() => {
    const canvas = previewRef.current
    if (canvas === null) return
    const scale = Math.max(1, Math.floor(132 / Math.max(doc.w, doc.h)))
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

  const setTarget = (key: string, to: RGBA) => setTargets((t) => ({ ...t, [key]: to }))
  const clearTarget = (key: string) =>
    setTargets((t) => {
      const next = { ...t }
      delete next[key]
      return next
    })

  if (rows.length === 0) return <p className="hint">캔버스가 비어 있습니다.</p>

  const changedRows = Object.keys(targets).length

  return (
    <div className="recolor">
      {/* 스크롤해도 결과가 계속 보여야 어떤 조합인지 판단할 수 있다. */}
      <div className="recolor-preview">
        <canvas ref={previewRef} />
        <div>
          <strong>
            {result.changed.toLocaleString()}픽셀 변경
          </strong>
          <span>
            {changedRows === 0
              ? '아래에서 바꿀 색을 지정하세요'
              : `${changedRows}개 색 지정됨 · 전체 ${rows.length}색`}
          </span>
        </div>
      </div>

      <div className="recolor-rows">
        {rows.map((row) => {
          const to = targets[row.key]
          const isTransparentSource = row.key === TRANSPARENT_KEY
          return (
            <div className={`recolor-row${to ? ' changed' : ''}`} key={row.key}>
              <span
                className={`swatch${isTransparentSource ? ' transparent' : ''}`}
                style={isTransparentSource ? undefined : { background: row.key }}
                title={isTransparentSource ? '투명 영역' : row.key}
              />
              <span className="recolor-hex">{isTransparentSource ? '투명' : row.key}</span>
              <span className="recolor-count">{row.count.toLocaleString()}</span>

              <span className="recolor-arrow">→</span>

              <input
                type="color"
                value={toHexRGB(to ?? row.from)}
                onChange={(e) => {
                  const rgba = parseHex(e.target.value)
                  // <input type="color">는 알파를 다루지 못한다. 투명을 골랐다가
                  // 색을 고르면 불투명으로 되돌린다.
                  if (rgba) setTarget(row.key, [rgba[0], rgba[1], rgba[2], 255])
                }}
                title="바꿀 색"
              />
              <button
                className={to && to[3] === 0 ? 'active' : ''}
                onClick={() => setTarget(row.key, TRANSPARENT)}
                title="투명으로 (지우기)"
              >
                투명
              </button>
              <button onClick={() => setTarget(row.key, current)} title="현재 그리기 색으로">
                현재
              </button>
              <button
                onClick={() => clearTarget(row.key)}
                disabled={to === undefined}
                title="이 행 지정 취소"
              >
                ↺
              </button>
            </div>
          )
        })}
      </div>

      <div className="recolor-foot">
        <div className="swatches">
          {palette.map((hex, i) => (
            <span key={`${hex}-${i}`} className="swatch" style={{ background: hex }} title={hex} />
          ))}
        </div>
        <p className="hint">
          팔레트는 참고용입니다. 각 행의 색 상자를 눌러 색을 고르세요.
        </p>

        <div className="row">
          <label>허용 오차 {tolerance}</label>
          <input
            className="grow"
            type="range"
            min={0}
            max={96}
            value={tolerance}
            onChange={(e) => setTolerance(Number(e.target.value))}
            title="0이면 정확히 같은 색만 바꿉니다"
          />
        </div>
        <p className="hint">
          0이 기본입니다. 올리면 비슷한 색까지 함께 바뀌어 명암 단계가 뭉개질 수 있습니다.
        </p>

        <div className="row">
          <button
            className="grow"
            onClick={() => setTargets({})}
            disabled={changedRows === 0}
          >
            전체 초기화
          </button>
          <button
            className="grow primary"
            onClick={() => onApply(result.doc)}
            disabled={result.changed === 0}
          >
            {result.changed === 0 ? '변경 없음' : `${changedRows}개 색 교체`}
          </button>
        </div>
        <p className="hint">되돌리기로 복구할 수 있습니다.</p>
      </div>
    </div>
  )
}
