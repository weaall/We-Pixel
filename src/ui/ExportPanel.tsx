import { useMemo, useState } from 'react'
import type { PixelDoc } from '../core/doc'
import { contentBounds } from '../core/doc'
import type { ActionSpec, MoveMode } from '../export/csharp'
import { defaultActionSpec, generateActorScript } from '../export/csharp'
import type { PackageResult } from '../export/package'
import { buildPackage } from '../export/package'
import { docToPngBlob, downloadBlob } from '../export/png'
import { defaultImportOptions } from '../export/unityMeta'

export interface ExportPanelProps {
  doc: PixelDoc
}

const MOVE_LABELS: ReadonlyArray<{ value: MoveMode; label: string }> = [
  { value: 'none', label: '없음' },
  { value: 'horizontal', label: '좌우 이동' },
  { value: 'topDown', label: '4방향 이동' },
]

export function ExportPanel({ doc }: ExportPanelProps) {
  const [assetName, setAssetName] = useState('PixelSprite')
  const [action, setAction] = useState<ActionSpec>(defaultActionSpec)
  const [pixelsPerUnit, setPixelsPerUnit] = useState(defaultImportOptions.pixelsPerUnit)
  const [includePostprocessor, setIncludePostprocessor] = useState(true)
  const [includeSpec, setIncludeSpec] = useState(true)
  const [previewScale, setPreviewScale] = useState(8)
  const [showCode, setShowCode] = useState(false)

  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PackageResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const patch = (p: Partial<ActionSpec>) => setAction((a) => ({ ...a, ...p }))
  const code = useMemo(() => generateActorScript(action), [action])
  const empty = useMemo(() => contentBounds(doc) === null, [doc])

  const exportPng = async () => {
    setError(null)
    try {
      const blob = await docToPngBlob(doc, 1)
      downloadBlob(blob, `${assetName || 'PixelSprite'}.png`)
    } catch (err) {
      setError(String(err))
    }
  }

  const exportZip = async () => {
    setError(null)
    setBusy(true)
    try {
      const res = await buildPackage({
        doc,
        assetName,
        action,
        unity: { pixelsPerUnit, targetFolder: defaultImportOptions.targetFolder },
        includePostprocessor,
        includeSpec,
        previewScale,
        encodePng: docToPngBlob,
      })
      downloadBlob(new Blob([res.bytes], { type: 'application/zip' }), res.filename)
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className="group">
        <h2>액션 요구사항</h2>

        <div className="row">
          <label>에셋 이름</label>
          <input
            className="grow"
            type="text"
            value={assetName}
            spellCheck={false}
            onChange={(e) => setAssetName(e.target.value)}
          />
        </div>
        <div className="row">
          <label>클래스명</label>
          <input
            className="grow"
            type="text"
            value={action.className}
            spellCheck={false}
            onChange={(e) => patch({ className: e.target.value })}
          />
        </div>
        <div className="row">
          <label>이동</label>
          <select
            className="grow"
            value={action.move}
            onChange={(e) => patch({ move: e.target.value as MoveMode })}
          >
            {MOVE_LABELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="row">
          <label className="check">
            <input
              type="checkbox"
              checked={action.jump}
              onChange={(e) => patch({ jump: e.target.checked })}
            />
            점프
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={action.flipSprite}
              onChange={(e) => patch({ flipSprite: e.target.checked })}
            />
            방향 반전
          </label>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={action.animate}
            onChange={(e) => patch({ animate: e.target.checked })}
          />
          프레임 애니메이션
        </label>

        {action.move !== 'none' && (
          <div className="row" style={{ marginTop: 8 }}>
            <label>속도</label>
            <input
              className="grow"
              type="number"
              min={0}
              step={0.5}
              value={action.moveSpeed}
              onChange={(e) => patch({ moveSpeed: Number(e.target.value) })}
            />
          </div>
        )}
        {action.jump && (
          <div className="row">
            <label>점프력</label>
            <input
              className="grow"
              type="number"
              min={0}
              step={0.5}
              value={action.jumpForce}
              onChange={(e) => patch({ jumpForce: Number(e.target.value) })}
            />
          </div>
        )}
        {action.jump && (
          <p className="hint">
            점프를 켜면 Rigidbody2D 기반으로 전환됩니다. transform 이동과 물리를 섞으면
            물리 엔진과 충돌하기 때문입니다.
          </p>
        )}

        <textarea
          style={{ marginTop: 8 }}
          placeholder="추가 요구사항을 적으면 생성된 코드 상단에 주석으로 들어갑니다."
          value={action.notes}
          onChange={(e) => patch({ notes: e.target.value })}
        />

        <button style={{ width: '100%', marginTop: 8 }} onClick={() => setShowCode((v) => !v)}>
          {showCode ? '코드 접기' : '생성될 C# 미리보기'}
        </button>
        {showCode && <div className="entries">{code}</div>}
      </section>

      <div className="divider" />

      <section className="group">
        <h2>유니티 임포트</h2>
        <div className="row">
          <label>PPU</label>
          <input
            className="grow"
            type="number"
            min={1}
            value={pixelsPerUnit}
            onChange={(e) => setPixelsPerUnit(Number(e.target.value))}
            title="Pixels Per Unit — 씬 스케일이 어긋나면 이 값을 확인하세요"
          />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={includePostprocessor}
            onChange={(e) => setIncludePostprocessor(e.target.checked)}
          />
          임포트 설정 강제 스크립트 포함
        </label>
        <label className="check" style={{ marginTop: 6 }}>
          <input
            type="checkbox"
            checked={includeSpec}
            onChange={(e) => setIncludeSpec(e.target.checked)}
          />
          재편집용 spec.json 포함
        </label>
        <div className="row" style={{ marginTop: 8 }}>
          <label>미리보기</label>
          <select
            className="grow"
            value={previewScale}
            onChange={(e) => setPreviewScale(Number(e.target.value))}
          >
            <option value={0}>넣지 않음</option>
            <option value={4}>4배 확대</option>
            <option value={8}>8배 확대</option>
            <option value={16}>16배 확대</option>
          </select>
        </div>
      </section>

      <section className="group">
        <h2>내보내기</h2>
        {empty && <p className="warn">캔버스가 비어 있습니다. 투명 PNG가 나옵니다.</p>}
        <div className="row">
          <button className="grow" onClick={exportPng} disabled={busy}>
            PNG만
          </button>
          <button className="grow primary" onClick={exportZip} disabled={busy}>
            {busy ? '만드는 중…' : 'ZIP 패키지'}
          </button>
        </div>

        {error && <p className="err">{error}</p>}
        {result && (
          <>
            {result.warnings.map((w) => (
              <p className="warn" key={w}>
                {w}
              </p>
            ))}
            <div className="entries">{result.entries.join('\n')}</div>
            <p className="hint">
              압축을 풀고 <code>Assets</code> 폴더를 유니티 프로젝트 루트에 덮어쓰면 됩니다.
            </p>
          </>
        )}
      </section>
    </>
  )
}
