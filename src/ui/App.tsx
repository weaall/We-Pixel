import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RGBA } from '../core/color'
import { parseHex } from '../core/color'
import { usedColors } from '../core/codec'
import type { PixelDoc } from '../core/doc'
import { clear, createDoc, MAX_SIZE, MIN_SIZE, resizeDoc } from '../core/doc'
import { History } from '../core/history'
import type { StampOptions, ToolId } from '../core/tools'
import { defaultStampOptions } from '../core/tools'
import { AiPanel } from './AiPanel'
import { CanvasView } from './CanvasView'
import { ExportPanel } from './ExportPanel'
import { GeneratePanel } from './GeneratePanel'
import { DEFAULT_PALETTE, PalettePanel } from './PalettePanel'
import { Toolbar } from './Toolbar'
import { WorkspacePanel } from './WorkspacePanel'

const SHORTCUT_TOOLS: Record<string, ToolId> = {
  b: 'pen',
  e: 'eraser',
  g: 'fill',
  l: 'line',
  r: 'rect',
  f: 'rectFill',
  i: 'picker',
}

/** 캔버스가 화면에서 대략 이 크기가 되도록 확대율을 잡는다. */
const TARGET_VIEW_PX = 512

function fitZoom(w: number, h: number): number {
  return Math.min(32, Math.max(1, Math.floor(TARGET_VIEW_PX / Math.max(w, h))))
}

export function App() {
  const [doc, setDoc] = useState<PixelDoc>(() => createDoc(32, 32))
  const [tool, setTool] = useState<ToolId>('pen')
  const [color, setColor] = useState<RGBA>(() => parseHex('#ef7d57') ?? [255, 255, 255, 255])
  const [stampOptions, setStampOptions] = useState<StampOptions>(defaultStampOptions)
  const [zoom, setZoom] = useState(() => fitZoom(32, 32))
  const [showGrid, setShowGrid] = useState(true)
  const [palette, setPalette] = useState<string[]>([...DEFAULT_PALETTE])
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)

  const [sizeW, setSizeW] = useState('32')
  const [sizeH, setSizeH] = useState('32')

  const history = useRef(new History())
  // History는 ref에 있어 변경이 렌더를 유발하지 않는다. 버튼 활성 상태를 위해 별도로 센다.
  const [histTick, setHistTick] = useState(0)
  const bumpHistory = () => setHistTick((v) => v + 1)

  const used = useMemo(() => usedColors(doc), [doc])
  const canUndo = useMemo(() => history.current.canUndo, [histTick])
  const canRedo = useMemo(() => history.current.canRedo, [histTick])

  /** 같은 버퍼를 유지하되 참조를 바꿔 리렌더를 유발한다. */
  const syncDoc = useCallback(() => {
    setDoc((d) => ({ ...d }))
  }, [])

  const beforeStroke = useCallback(() => {
    history.current.commit(doc)
    bumpHistory()
  }, [doc])

  const undo = useCallback(() => {
    const prev = history.current.undo(doc)
    if (prev) {
      setDoc(prev)
      bumpHistory()
    }
  }, [doc])

  const redo = useCallback(() => {
    const next = history.current.redo(doc)
    if (next) {
      setDoc(next)
      bumpHistory()
    }
  }, [doc])

  const clearCanvas = useCallback(() => {
    history.current.commit(doc)
    clear(doc)
    syncDoc()
    bumpHistory()
  }, [doc, syncDoc])

  const replaceDoc = useCallback(
    (next: PixelDoc) => {
      history.current.commit(doc)
      setDoc(next)
      bumpHistory()
    },
    [doc],
  )

  const applySize = () => {
    const w = clampSize(Number(sizeW))
    const h = clampSize(Number(sizeH))
    if (w === doc.w && h === doc.h) return
    replaceDoc(resizeDoc(doc, w, h))
    setSizeW(String(w))
    setSizeH(String(h))
    setZoom(fitZoom(w, h))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      // 입력 필드에서 타이핑 중이면 단축키를 삼키지 않는다.
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return

      const key = e.key.toLowerCase()

      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const t = SHORTCUT_TOOLS[key]
      if (t) {
        setTool(t)
        return
      }
      if (key === '[') setStampOptions((o) => ({ ...o, size: Math.max(1, o.size - 1) }))
      else if (key === ']') setStampOptions((o) => ({ ...o, size: Math.min(8, o.size + 1) }))
      else if (key === '+' || key === '=') setZoom((z) => Math.min(32, z + 1))
      else if (key === '-') setZoom((z) => Math.max(1, z - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          WE<span>·</span>PIXEL
        </div>

        <div className="row" style={{ margin: 0 }}>
          <input
            type="number"
            style={{ width: 66 }}
            value={sizeW}
            min={MIN_SIZE}
            max={MAX_SIZE}
            onChange={(e) => setSizeW(e.target.value)}
          />
          <span className="status">×</span>
          <input
            type="number"
            style={{ width: 66 }}
            value={sizeH}
            min={MIN_SIZE}
            max={MAX_SIZE}
            onChange={(e) => setSizeH(e.target.value)}
          />
          <button onClick={applySize}>크기 적용</button>
        </div>

        <div className="spacer" />

        <div className="status">
          {doc.w}×{doc.h} · {zoom}x · {hover ? `(${hover.x}, ${hover.y})` : '—'}
        </div>
      </header>

      <div className="body">
        <aside className="side">
          <Toolbar
            tool={tool}
            setTool={setTool}
            stampOptions={stampOptions}
            setStampOptions={setStampOptions}
            zoom={zoom}
            setZoom={setZoom}
            showGrid={showGrid}
            setShowGrid={setShowGrid}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            onClear={clearCanvas}
          />
          <div className="divider" />
          <PalettePanel
            color={color}
            setColor={setColor}
            palette={palette}
            setPalette={setPalette}
            used={used}
          />
        </aside>

        <main className="stage">
          <CanvasView
            doc={doc}
            zoom={zoom}
            showGrid={showGrid}
            tool={tool}
            color={color}
            stampOptions={stampOptions}
            onBeforeStroke={beforeStroke}
            onDocChanged={syncDoc}
            onPickColor={setColor}
            onHover={setHover}
            onZoomDelta={(d) => setZoom((z) => Math.min(32, Math.max(1, z + d)))}
          />
        </main>

        <aside className="side right">
          <AiPanel width={doc.w} height={doc.h} onGenerate={replaceDoc} />
          <div className="divider" />
          <GeneratePanel width={doc.w} height={doc.h} onGenerate={replaceDoc} />
          <div className="divider" />
          <WorkspacePanel doc={doc} onLoad={replaceDoc} />
          <div className="divider" />
          <ExportPanel doc={doc} />
        </aside>
      </div>
    </div>
  )
}

function clampSize(v: number): number {
  if (!Number.isFinite(v)) return 32
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.floor(v)))
}
