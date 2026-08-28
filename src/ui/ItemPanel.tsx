import { useMemo, useState } from 'react'
import { fromSpec } from '../core/codec'
import type { PixelDoc } from '../core/doc'
import { RARITIES, raritySet } from '../core/generate/item'
import { ITEM_SIZE } from '../core/generate/itemFrame'
import { defaultActionSpec } from '../export/csharp'
import { buildPackage } from '../export/package'
import { docToPngBlob, downloadBlob } from '../export/png'
import { defaultImportOptions } from '../export/unityMeta'
import { upscale } from '../core/resample'
import { DocThumb } from './DocThumb'

export interface ItemPanelProps {
  onGenerateMany: (
    docs: ReadonlyArray<PixelDoc>,
    prefix?: string,
    names?: ReadonlyArray<string>,
  ) => void
}

/**
 * 아이템 칸을 등급별로 만든다.
 *
 * 참고 그림이 전설(금색)이라 나머지 다섯은 색조만 옮겨 만든다. 형태는 한 픽셀도
 * 바뀌지 않으므로 여섯 칸이 나란히 놓여도 어긋나지 않는다.
 */
export function ItemPanel(props: ItemPanelProps) {
  const [factor, setFactor] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const set = useMemo(() => raritySet(), [])
  const docs = useMemo(
    () => set.map((r) => upscale(fromSpec(r.spec), factor)),
    [set, factor],
  )

  const exportSheet = async () => {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const res = await buildPackage({
        doc: docs[0],
        sheet: set.map((r, i) => ({ name: `Item_${r.en}`, doc: docs[i] })),
        assetName: 'ItemSlots',
        action: defaultActionSpec,
        unity: defaultImportOptions,
        includePostprocessor: true,
        includeSpec: true,
        previewScale: 0,
        encodePng: docToPngBlob,
      })
      downloadBlob(new Blob([res.bytes], { type: 'application/zip' }), res.filename)
      setNote(res.warnings.join(' ') || `${res.filename} 을 내려받았습니다.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="group">
      <h2>아이템 칸</h2>

      <div className="variant-strip">
        {set.map((r, i) => (
          <figure key={r.id}>
            <DocThumb doc={docs[i]} box={72} />
            <figcaption>
              {r.name}
              <br />
              {r.en}
            </figcaption>
          </figure>
        ))}
      </div>

      <p className="hint">
        참고 그림이 전설(금색)입니다. 나머지 다섯은 색조만 옮겨 만들어 형태가 한
        픽셀도 다르지 않습니다 — 여섯 칸이 나란히 놓여도 어긋나지 않습니다.
      </p>

      <div className="row">
        <label>크기</label>
        <div className="grow seg">
          {[1, 2, 4].map((f) => (
            <button
              key={f}
              className={factor === f ? 'active' : ''}
              onClick={() => setFactor(f)}
              data-tip={`${ITEM_SIZE.w * f}x${ITEM_SIZE.h * f} — 정수배라 흐려지지 않습니다`}
            >
              {ITEM_SIZE.w * f}
            </button>
          ))}
        </div>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="grow primary"
          onClick={() =>
            props.onGenerateMany(
              docs,
              '아이템',
              RARITIES.map((r) => `${r.name} 칸`),
            )
          }
        >
          새 페이지 6장
        </button>
        <button
          className="grow"
          disabled={busy}
          onClick={exportSheet}
          data-tip="여섯 등급을 한 텍스처로 묶습니다"
        >
          유니티 시트
        </button>
      </div>
      {note !== null && <p className="hint">{note}</p>}
      {error !== null && <p className="hint error">{error}</p>}
    </section>
  )
}
