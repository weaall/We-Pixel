import { useEffect, useRef, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import type { RGBA } from '../core/color'
import { parseHex, toHex, toHexRGB } from '../core/color'
import type { StampOptions, ToolId } from '../core/tools'
import type { IconProps } from './icons'
import {
  IconBrush,
  IconEraser,
  IconFill,
  IconGrid,
  IconLine,
  IconMirrorX,
  IconMirrorY,
  IconPen,
  IconPicker,
  IconRect,
  IconRectFill,
  IconRedo,
  IconTrash,
  IconUndo,
} from './icons'

const TOOLS: ReadonlyArray<{
  id: ToolId
  label: string
  key: string
  icon: ComponentType<IconProps>
}> = [
  { id: 'pen', label: '펜', key: 'B', icon: IconPen },
  { id: 'eraser', label: '지우개', key: 'E', icon: IconEraser },
  { id: 'fill', label: '채우기', key: 'G', icon: IconFill },
  { id: 'line', label: '직선', key: 'L', icon: IconLine },
  { id: 'rect', label: '사각', key: 'R', icon: IconRect },
  { id: 'rectFill', label: '사각 칠', key: 'F', icon: IconRectFill },
  { id: 'picker', label: '스포이드', key: 'I', icon: IconPicker },
]

export interface LeftRailProps {
  tool: ToolId
  setTool: (t: ToolId) => void
  stampOptions: StampOptions
  setStampOptions: (o: StampOptions) => void
  showGrid: boolean
  setShowGrid: (v: boolean) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  color: RGBA
  setColor: (c: RGBA) => void
  palette: string[]
  setPalette: (p: string[]) => void
  used: ReadonlyArray<{ hex: string; count: number }>
}

export function LeftRail(props: LeftRailProps) {
  const [open, setOpen] = useState<'brush' | 'color' | null>(null)

  return (
    <aside className="rail left">
      {TOOLS.map((t) => (
        <RailButton
          key={t.id}
          active={props.tool === t.id}
          title={`${t.label} (${t.key})`}
          onClick={() => props.setTool(t.id)}
        >
          <t.icon />
        </RailButton>
      ))}

      <div className="rail-divider" />

      <Popover
        open={open === 'brush'}
        onToggle={() => setOpen(open === 'brush' ? null : 'brush')}
        title={`브러시 ${props.stampOptions.size}px`}
        icon={<IconBrush />}
        badge={String(props.stampOptions.size)}
      >
        <BrushPopover {...props} />
      </Popover>

      <RailButton
        active={props.stampOptions.mirrorX}
        title="좌우 대칭"
        onClick={() =>
          props.setStampOptions({ ...props.stampOptions, mirrorX: !props.stampOptions.mirrorX })
        }
      >
        <IconMirrorX />
      </RailButton>
      <RailButton
        active={props.stampOptions.mirrorY}
        title="상하 대칭"
        onClick={() =>
          props.setStampOptions({ ...props.stampOptions, mirrorY: !props.stampOptions.mirrorY })
        }
      >
        <IconMirrorY />
      </RailButton>
      <RailButton
        active={props.showGrid}
        title="격자 (6x 이상에서 표시)"
        onClick={() => props.setShowGrid(!props.showGrid)}
      >
        <IconGrid />
      </RailButton>

      <div className="rail-divider" />

      <Popover
        open={open === 'color'}
        onToggle={() => setOpen(open === 'color' ? null : 'color')}
        title={`색상 ${toHex(props.color)}`}
        icon={<span className="rail-swatch" style={{ background: toHex(props.color) }} />}
      >
        <ColorPopover {...props} />
      </Popover>

      <div className="rail-divider" />

      <RailButton title="되돌리기 (Ctrl+Z)" onClick={props.onUndo} disabled={!props.canUndo}>
        <IconUndo />
      </RailButton>
      <RailButton title="다시 실행 (Ctrl+Shift+Z)" onClick={props.onRedo} disabled={!props.canRedo}>
        <IconRedo />
      </RailButton>
      <RailButton title="전체 지우기" onClick={props.onClear}>
        <IconTrash />
      </RailButton>
    </aside>
  )
}

function BrushPopover({ stampOptions, setStampOptions }: LeftRailProps) {
  return (
    <>
      <div className="row">
        <label>크기 {stampOptions.size}</label>
        <input
          className="grow"
          type="range"
          min={1}
          max={8}
          value={stampOptions.size}
          onChange={(e) => setStampOptions({ ...stampOptions, size: Number(e.target.value) })}
        />
      </div>
      <p className="hint">단축키 [ ] 로도 바꿉니다.</p>
    </>
  )
}

function ColorPopover({ color, setColor, palette, setPalette, used }: LeftRailProps) {
  const currentHex = toHex(color)
  const pick = (hex: string) => {
    const rgba = parseHex(hex)
    if (rgba) setColor(rgba)
  }

  return (
    <>
      <input
        type="color"
        value={toHexRGB(color)}
        onChange={(e) => {
          const rgba = parseHex(e.target.value)
          // <input type="color">는 알파를 다루지 못하므로 기존 알파를 유지한다.
          if (rgba) setColor([rgba[0], rgba[1], rgba[2], color[3]])
        }}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <label>알파 {color[3]}</label>
        <input
          className="grow"
          type="range"
          min={0}
          max={255}
          value={color[3]}
          onChange={(e) => setColor([color[0], color[1], color[2], Number(e.target.value)])}
        />
      </div>
      <div className="row">
        <input
          className="grow"
          type="text"
          value={currentHex}
          spellCheck={false}
          onChange={(e) => pick(e.target.value)}
        />
        <button
          onClick={() => !palette.includes(currentHex) && setPalette([...palette, currentHex])}
          title="현재 색을 팔레트에 추가"
        >
          +
        </button>
      </div>

      <div className="swatches">
        {palette.map((hex, i) => (
          <button
            key={`${hex}-${i}`}
            className={`swatch${hex === currentHex ? ' selected' : ''}`}
            style={{ background: hex }}
            title={`${hex}  (Shift+클릭: 삭제)`}
            onClick={(e) => {
              if (e.shiftKey) setPalette(palette.filter((_, idx) => idx !== i))
              else pick(hex)
            }}
          />
        ))}
      </div>

      {used.length > 0 && (
        <>
          <p className="hint" style={{ marginBottom: 4 }}>
            사용 중 ({used.length})
          </p>
          <div className="swatches">
            {used.slice(0, 16).map((u) => (
              <button
                key={u.hex}
                className={`swatch${u.hex === currentHex ? ' selected' : ''}`}
                style={{ background: u.hex }}
                title={`${u.hex} — ${u.count}px`}
                onClick={() => pick(u.hex)}
              />
            ))}
          </div>
        </>
      )}
    </>
  )
}

function RailButton(props: {
  children: ReactNode
  title: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
}) {
  return (
    <button
      className={`rail-btn${props.active ? ' active' : ''}`}
      data-tip={props.title}
      aria-label={props.title}
      aria-pressed={props.active}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  )
}

/** 레일 버튼에 붙는 작은 패널. 모달을 띄울 만큼 무겁지 않은 설정용. */
function Popover(props: {
  open: boolean
  onToggle: () => void
  title: string
  icon: ReactNode
  badge?: string
  children: ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!props.open) return
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) props.onToggle()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onToggle()
    }
    // 즉시 등록하면 팝오버를 연 클릭이 그대로 닫아버린다.
    const id = setTimeout(() => window.addEventListener('pointerdown', onDown), 0)
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(id)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [props])

  return (
    <div className="rail-popover-wrap" ref={wrapRef}>
      <button
        className={`rail-btn${props.open ? ' active' : ''}`}
        data-tip={props.title}
        aria-label={props.title}
        aria-expanded={props.open}
        onClick={props.onToggle}
      >
        {props.icon}
        {props.badge && <span className="rail-badge">{props.badge}</span>}
      </button>
      {props.open && (
        <div className="rail-popover">
          <h3>{props.title}</h3>
          {props.children}
        </div>
      )}
    </div>
  )
}
