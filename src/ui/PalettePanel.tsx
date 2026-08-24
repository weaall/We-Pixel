import type { RGBA } from '../core/color'
import { parseHex, toHex, toHexRGB } from '../core/color'

/** Sweetie 16 — 명암 대비가 잘 잡힌 공개 팔레트. */
export const DEFAULT_PALETTE: readonly string[] = [
  '#1a1c2c',
  '#5d275d',
  '#b13e53',
  '#ef7d57',
  '#ffcd75',
  '#a7f070',
  '#38b764',
  '#257179',
  '#29366f',
  '#3b5dc9',
  '#41a6f6',
  '#73eff7',
  '#f4f4f4',
  '#94b0c2',
  '#566c86',
  '#333c57',
]

export interface PalettePanelProps {
  color: RGBA
  setColor: (c: RGBA) => void
  palette: string[]
  setPalette: (p: string[]) => void
  used: ReadonlyArray<{ hex: string; count: number }>
}

export function PalettePanel(props: PalettePanelProps) {
  const { color, setColor, palette, setPalette, used } = props
  const currentHex = toHex(color)

  const pick = (hex: string) => {
    const rgba = parseHex(hex)
    if (rgba) setColor(rgba)
  }

  const addCurrent = () => {
    if (palette.includes(currentHex)) return
    setPalette([...palette, currentHex])
  }

  return (
    <>
      <section className="group">
        <h2>색상</h2>
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
          <button onClick={addCurrent} title="현재 색을 팔레트에 추가">
            +
          </button>
        </div>
      </section>

      <section className="group">
        <h2>팔레트</h2>
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
        <p className="hint">Shift+클릭으로 팔레트에서 제거합니다.</p>
      </section>

      {used.length > 0 && (
        <section className="group">
          <h2>사용 중 ({used.length})</h2>
          <div className="swatches">
            {used.slice(0, 24).map((u) => (
              <button
                key={u.hex}
                className={`swatch${u.hex === currentHex ? ' selected' : ''}`}
                style={{ background: u.hex }}
                title={`${u.hex} — ${u.count}px`}
                onClick={() => pick(u.hex)}
              />
            ))}
          </div>
        </section>
      )}
    </>
  )
}
