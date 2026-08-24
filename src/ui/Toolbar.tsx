import type { StampOptions, ToolId } from '../core/tools'
import { MAX_ZOOM } from './zoom'

const TOOLS: ReadonlyArray<{ id: ToolId; label: string; key: string }> = [
  { id: 'pen', label: '펜', key: 'B' },
  { id: 'eraser', label: '지우개', key: 'E' },
  { id: 'fill', label: '채우기', key: 'G' },
  { id: 'line', label: '직선', key: 'L' },
  { id: 'rect', label: '사각', key: 'R' },
  { id: 'rectFill', label: '사각칠', key: 'F' },
  { id: 'picker', label: '스포이드', key: 'I' },
]

export interface ToolbarProps {
  tool: ToolId
  setTool: (t: ToolId) => void
  stampOptions: StampOptions
  setStampOptions: (o: StampOptions) => void
  zoom: number
  setZoom: (z: number) => void
  showGrid: boolean
  setShowGrid: (v: boolean) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
}

export function Toolbar(props: ToolbarProps) {
  const { stampOptions: so, setStampOptions } = props

  return (
    <>
      <section className="group">
        <h2>도구</h2>
        <div className="tool-grid">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={props.tool === t.id ? 'active' : ''}
              onClick={() => props.setTool(t.id)}
              title={`${t.label} (${t.key})`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section className="group">
        <h2>브러시</h2>
        <div className="row">
          <label>크기 {so.size}</label>
          <input
            className="grow"
            type="range"
            min={1}
            max={8}
            value={so.size}
            onChange={(e) => setStampOptions({ ...so, size: Number(e.target.value) })}
          />
        </div>
        <div className="row">
          <label className="check">
            <input
              type="checkbox"
              checked={so.mirrorX}
              onChange={(e) => setStampOptions({ ...so, mirrorX: e.target.checked })}
            />
            좌우 대칭
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={so.mirrorY}
              onChange={(e) => setStampOptions({ ...so, mirrorY: e.target.checked })}
            />
            상하 대칭
          </label>
        </div>
      </section>

      <section className="group">
        <h2>보기</h2>
        <div className="row">
          <label>확대 {props.zoom}x</label>
          <input
            className="grow"
            type="range"
            min={1}
            max={MAX_ZOOM}
            value={props.zoom}
            onChange={(e) => props.setZoom(Number(e.target.value))}
          />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={props.showGrid}
            onChange={(e) => props.setShowGrid(e.target.checked)}
          />
          격자 (6x 이상)
        </label>
      </section>

      <section className="group">
        <h2>편집</h2>
        <div className="row">
          <button className="grow" onClick={props.onUndo} disabled={!props.canUndo}>
            되돌리기
          </button>
          <button className="grow" onClick={props.onRedo} disabled={!props.canRedo}>
            다시 실행
          </button>
        </div>
        <button style={{ width: '100%' }} onClick={props.onClear}>
          전체 지우기
        </button>
        <p className="hint">
          Ctrl+Z / Ctrl+Shift+Z · [ ] 브러시 크기 · Ctrl+휠 확대
        </p>
      </section>
    </>
  )
}
