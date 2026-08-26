import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType } from 'react'
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
import type { IconProps } from './icons'
import {
  IconDice,
  IconFolder,
  IconImage,
  IconPackage,
  IconRecolor,
  IconResize,
  IconSparkle,
} from './icons'
import { ImportPanel } from './ImportPanel'
import { LeftRail } from './LeftRail'
import { Modal } from './Modal'
import { DEFAULT_PALETTE } from './palette'
import { PreviewOverlay } from './PreviewOverlay'
import { RecolorPanel } from './RecolorPanel'
import { fitZoom, MAX_ZOOM } from './zoom'
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

type ModalId = 'ai' | 'generate' | 'import' | 'recolor' | 'workspace' | 'export' | 'size'

const RIGHT_RAIL: ReadonlyArray<{ id: ModalId; label: string; icon: ComponentType<IconProps> }> = [
  { id: 'ai', label: 'AI 생성', icon: IconSparkle },
  { id: 'generate', label: '자동 생성', icon: IconDice },
  { id: 'import', label: '이미지 가져오기', icon: IconImage },
  { id: 'recolor', label: '색상 교체', icon: IconRecolor },
  { id: 'workspace', label: '디자인 저장소', icon: IconFolder },
  { id: 'export', label: '내보내기', icon: IconPackage },
  { id: 'size', label: '캔버스 크기', icon: IconResize },
]

export function App() {
  const [doc, setDoc] = useState<PixelDoc>(() => createDoc(32, 32))
  const [tool, setTool] = useState<ToolId>('pen')
  const [color, setColor] = useState<RGBA>(() => parseHex('#ef7d57') ?? [255, 255, 255, 255])
  const [stampOptions, setStampOptions] = useState<StampOptions>(defaultStampOptions)
  const [zoom, setZoom] = useState(() => fitZoom(32, 32))
  const [showGrid, setShowGrid] = useState(true)
  const [palette, setPalette] = useState<string[]>([...DEFAULT_PALETTE])

  const [modal, setModal] = useState<ModalId | null>(null)
  const [sizeW, setSizeW] = useState('32')
  const [sizeH, setSizeH] = useState('32')

  /**
   * 좌표 표시는 DOM에 직접 쓴다.
   *
   * state로 두면 pointermove마다 App 전체가 리렌더되어 레일과 미리보기까지
   * 다시 그려진다. 텍스트 한 줄 때문에 치를 비용이 아니다.
   */
  const hoverLabelRef = useRef<HTMLSpanElement | null>(null)
  const handleHover = useCallback((pos: { x: number; y: number } | null) => {
    const el = hoverLabelRef.current
    if (el !== null) el.textContent = pos === null ? '—' : `${pos.x}, ${pos.y}`
  }, [])

  const stageRef = useRef<HTMLDivElement | null>(null)
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null)
  /** 미리보기의 다시 그리기 함수. 스트로크 중 React를 거치지 않고 부르기 위해 ref로 둔다. */
  const previewRedraw = useRef<(() => void) | null>(null)
  const handlePaint = useCallback(() => previewRedraw.current?.(), [])
  const registerPreviewRedraw = useCallback((fn: (() => void) | null) => {
    previewRedraw.current = fn
  }, [])

  /** 캔버스 위에 이미지를 떨어뜨리면 가져오기 모달이 받는다. */
  const importDrop = useRef<((file: File) => void) | null>(null)
  const registerImportDrop = useCallback((fn: ((file: File) => void) | null) => {
    importDrop.current = fn
  }, [])
  const [stageDragging, setStageDragging] = useState(false)
  /** 모달이 닫혀 있는 동안 떨어진 파일. 모달이 열리면 넘긴다. */
  const droppedFile = useRef<File | null>(null)

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

  /**
   * 스테이지 크기를 관측해 확대율을 맞춘다.
   *
   * 사용자가 직접 확대율을 만졌으면 건드리지 않는다 — 창 크기가 바뀔 때마다
   * 값이 튀면 작업 중에 방해가 된다. 크기 적용이나 새 문서 때만 다시 맞춘다.
   */
  const userSetZoom = useRef(false)

  const applySize = () => {
    const w = clampSize(Number(sizeW))
    const h = clampSize(Number(sizeH))
    setSizeW(String(w))
    setSizeH(String(h))
    setModal(null)
    if (w === doc.w && h === doc.h) return
    replaceDoc(resizeDoc(doc, w, h))
    userSetZoom.current = false
    setZoom(fitZoom(w, h, stageSize ?? undefined))
  }

  /**
   * 스테이지의 내용 영역을 잰다.
   *
   * clientWidth는 패딩을 포함하므로 빼준다. 스타일시트의 padding 값을 코드에
   * 복사해 두면 한쪽만 바뀌었을 때 조용히 어긋나므로 계산된 값을 읽는다.
   */
  const measureStage = useCallback(() => {
    const el = stageRef.current
    if (el === null) return
    const cs = getComputedStyle(el)
    const px = (v: string) => parseFloat(v) || 0
    setStageSize({
      width: el.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight),
      height: el.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom),
    })
  }, [])

  useEffect(() => {
    const el = stageRef.current
    if (el === null) return

    measureStage()

    // ResizeObserver가 주 경로지만, 이것만 믿으면 관측이 지연되거나 막힌 환경에서
    // 확대율이 갱신되지 않아 캔버스가 스테이지를 넘친다. window resize로 보강한다.
    const observer = new ResizeObserver(() => measureStage())
    observer.observe(el)
    window.addEventListener('resize', measureStage)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measureStage)
    }
  }, [measureStage])

  useEffect(() => {
    if (stageSize === null || userSetZoom.current) return
    setZoom(fitZoom(doc.w, doc.h, stageSize))
  }, [stageSize, doc.w, doc.h])

  /**
   * Ctrl(또는 Cmd) + 휠로 캔버스를 확대/축소한다.
   *
   * React의 onWheel은 루트에 passive 리스너로 붙어 preventDefault가 무시된다.
   * 그대로 두면 캔버스가 확대되면서 브라우저 페이지 확대도 같이 일어난다.
   * 네이티브 리스너를 passive: false로 직접 붙여야 막을 수 있다.
   */
  const zoomAnchor = useRef<{ docX: number; docY: number; clientX: number; clientY: number } | null>(
    null,
  )
  /**
   * 휠 이벤트는 한 프레임에 여러 개 들어온다. 핸들러가 state의 zoom을 읽으면
   * 리렌더 전까지 값이 그대로라 여러 번 굴려도 한 단계만 먹는다.
   * 최신 값을 동기적으로 읽고 쓰기 위해 ref로 따로 들고 간다.
   */
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  useEffect(() => {
    const stage = stageRef.current
    if (stage === null) return

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()

      const canvas = stage.querySelector('canvas')
      if (canvas === null) return

      const current = zoomRef.current
      // 확대 폭을 현재 배율에 비례시킨다. 항상 1씩이면 40x에서 답답하다.
      const step = Math.max(1, Math.round(current * 0.15))
      const next = Math.min(MAX_ZOOM, Math.max(1, current + (e.deltaY < 0 ? step : -step)))
      if (next === current) return

      // 커서 아래의 문서 좌표를 기억해 두었다가, 확대 후 같은 자리에 오도록 스크롤한다.
      // 앵커는 이번 프레임의 첫 이벤트 것만 남긴다. 뒤 이벤트는 아직 반영되지 않은
      // 캔버스 크기를 기준으로 계산하게 되어 좌표가 어긋난다.
      const rect = canvas.getBoundingClientRect()
      if (zoomAnchor.current === null) {
        zoomAnchor.current = {
          docX: (e.clientX - rect.left) / current,
          docY: (e.clientY - rect.top) / current,
          clientX: e.clientX,
          clientY: e.clientY,
        }
      }
      userSetZoom.current = true
      zoomRef.current = next
      setZoom(next)
    }

    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [])

  // 캔버스 크기가 확정된 뒤에 보정해야 한다. useEffect면 한 프레임 늦어 화면이 튄다.
  useLayoutEffect(() => {
    const anchor = zoomAnchor.current
    const stage = stageRef.current
    if (anchor === null || stage === null) return
    zoomAnchor.current = null

    const canvas = stage.querySelector('canvas')
    if (canvas === null) return
    const rect = canvas.getBoundingClientRect()
    stage.scrollLeft += rect.left + anchor.docX * zoom - anchor.clientX
    stage.scrollTop += rect.top + anchor.docY * zoom - anchor.clientY
  }, [zoom])

  // 모달이 열려 있으면 캔버스 단축키가 먹지 않아야 한다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      // 입력 필드에서 타이핑 중이면 단축키를 삼키지 않는다.
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (modal !== null) return

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
      else if (key === '+' || key === '=') {
        userSetZoom.current = true
        setZoom((z) => Math.min(MAX_ZOOM, z + 1))
      } else if (key === '-') {
        userSetZoom.current = true
        setZoom((z) => Math.max(1, z - 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, modal])

  /** 가져오기 모달이 열린 뒤에 대기 중인 파일을 넘긴다. */
  const handleImportReady = useCallback((fn: ((file: File) => void) | null) => {
    registerImportDrop(fn)
    if (fn && droppedFile.current) {
      fn(droppedFile.current)
      droppedFile.current = null
    }
  }, [registerImportDrop])

  const openModal = (id: ModalId) => {
    if (id === 'size') {
      setSizeW(String(doc.w))
      setSizeH(String(doc.h))
    }
    setModal(id)
  }

  return (
    <div className="app">
      <div className="body">
        <LeftRail
          tool={tool}
          setTool={setTool}
          stampOptions={stampOptions}
          setStampOptions={setStampOptions}
          showGrid={showGrid}
          setShowGrid={setShowGrid}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          onClear={clearCanvas}
          color={color}
          setColor={setColor}
          palette={palette}
          setPalette={setPalette}
          used={used}
        />

        <main
          className={`stage${stageDragging ? ' drag-over' : ''}`}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes('Files')) return
            e.preventDefault()
            setStageDragging(true)
          }}
          onDragLeave={(e) => {
            // 자식 위로 옮겨갈 때도 leave가 오므로 스테이지를 실제로 벗어났는지 본다.
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
            setStageDragging(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setStageDragging(false)
            const f = e.dataTransfer.files[0]
            if (!f) return
            // 가져오기 모달이 닫혀 있으면 열고, 준비되면 그때 넘긴다.
            if (importDrop.current) importDrop.current(f)
            else {
              droppedFile.current = f
              setModal('import')
            }
          }}
        >
          <div className="stage-scroll" ref={stageRef}>
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
              onHover={handleHover}
              onPaint={handlePaint}
            />
          </div>

          {/* 스크롤 영역 밖에 두어야 화면 모서리에 고정된다. */}
          <PreviewOverlay doc={doc} registerRedraw={registerPreviewRedraw} />

          <div className="stage-status">
            <span className="brand">
              WE<span>·</span>PIXEL
            </span>
            <span>
              {doc.w}×{doc.h}
            </span>
            <span>{zoom}x</span>
            <span ref={hoverLabelRef}>—</span>
          </div>
        </main>

        <aside className="rail right">
          {RIGHT_RAIL.map((item) => (
            <button
              key={item.id}
              className={`rail-btn${modal === item.id ? ' active' : ''}`}
              data-tip={item.label}
              aria-label={item.label}
              onClick={() => openModal(item.id)}
            >
              <item.icon />
            </button>
          ))}
        </aside>
      </div>

      {modal === 'ai' && (
        <Modal title="AI 생성" onClose={() => setModal(null)}>
          <AiPanel width={doc.w} height={doc.h} doc={doc} onGenerate={replaceDoc} />
        </Modal>
      )}
      {modal === 'generate' && (
        <Modal title="자동 생성" onClose={() => setModal(null)}>
          <GeneratePanel width={doc.w} height={doc.h} onGenerate={replaceDoc} />
        </Modal>
      )}
      {modal === 'import' && (
        <Modal title="이미지 가져오기" onClose={() => setModal(null)}>
          <ImportPanel
            width={doc.w}
            height={doc.h}
            onApply={(next) => {
              replaceDoc(next)
              setModal(null)
            }}
            registerDrop={handleImportReady}
          />
        </Modal>
      )}
      {modal === 'recolor' && (
        <Modal title="색상 교체" onClose={() => setModal(null)} wide>
          <RecolorPanel
            doc={doc}
            current={color}
            palette={palette}
            onApply={(next) => {
              replaceDoc(next)
              setModal(null)
            }}
          />
        </Modal>
      )}
      {modal === 'workspace' && (
        <Modal title="디자인 저장소" onClose={() => setModal(null)}>
          <WorkspacePanel
            doc={doc}
            onLoad={(next) => {
              replaceDoc(next)
              setModal(null)
            }}
          />
        </Modal>
      )}
      {modal === 'export' && (
        <Modal title="내보내기" onClose={() => setModal(null)} wide>
          <ExportPanel doc={doc} />
        </Modal>
      )}
      {modal === 'size' && (
        <Modal title="캔버스 크기" onClose={() => setModal(null)}>
          <section className="group">
            <div className="row">
              <label>가로</label>
              <input
                className="grow"
                type="number"
                value={sizeW}
                min={MIN_SIZE}
                max={MAX_SIZE}
                onChange={(e) => setSizeW(e.target.value)}
              />
            </div>
            <div className="row">
              <label>세로</label>
              <input
                className="grow"
                type="number"
                value={sizeH}
                min={MIN_SIZE}
                max={MAX_SIZE}
                onChange={(e) => setSizeH(e.target.value)}
              />
            </div>
            <div className="preset-row">
              {[16, 32, 48, 64, 96, 128].map((n) => (
                <button
                  key={n}
                  className={sizeW === String(n) && sizeH === String(n) ? 'active' : ''}
                  onClick={() => {
                    setSizeW(String(n))
                    setSizeH(String(n))
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <button className="primary" style={{ width: '100%', marginTop: 10 }} onClick={applySize}>
              적용
            </button>
            <p className="hint">
              좌상단 기준으로 잘리거나 여백이 붙습니다. 되돌리기로 복구할 수 있습니다.
            </p>
          </section>
        </Modal>
      )}
    </div>
  )
}

function clampSize(v: number): number {
  if (!Number.isFinite(v)) return 32
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.floor(v)))
}
