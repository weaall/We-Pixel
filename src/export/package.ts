import JSZip from 'jszip'
import type { PixelDoc } from '../core/doc'
import { toSpec, TooManyColorsError } from '../core/codec'
import type { ActionSpec } from './csharp'
import { generateActorScript, sanitizeClassName } from './csharp'
import type { UnityImportOptions } from './unityMeta'
import { importPostprocessor, newGuid, textureMeta } from './unityMeta'

/**
 * PNG 인코딩은 플랫폼마다 수단이 다르다 (브라우저는 canvas, Node는 zlib).
 * 패키징 로직을 양쪽에서 그대로 쓰기 위해 주입받는다.
 */
export type PngEncoder = (doc: PixelDoc, scale: number) => Promise<Uint8Array | Blob>

export interface PackageOptions {
  doc: PixelDoc
  /** 에셋 파일명 기준이 되는 이름. */
  assetName: string
  action: ActionSpec
  unity: UnityImportOptions
  includePostprocessor: boolean
  includeSpec: boolean
  /** 미리보기용 확대 PNG 배율. 0이면 넣지 않는다. */
  previewScale: number
  encodePng: PngEncoder
}

export interface PackageResult {
  /** ZIP 바이트. 브라우저에서 내려줄 때는 Blob으로 감싸면 된다. */
  bytes: Uint8Array<ArrayBuffer>
  filename: string
  /** 압축 파일에 담긴 경로 목록. UI에 그대로 보여준다. */
  entries: string[]
  /** 넣지 못한 항목과 이유. */
  warnings: string[]
}

/**
 * 유니티 폴더 구조를 그대로 담은 ZIP을 만든다.
 * 사용자가 압축을 풀고 Assets 폴더를 프로젝트 루트에 끌어다 놓으면 끝나도록 한 배치다.
 */
export async function buildPackage(o: PackageOptions): Promise<PackageResult> {
  const zip = new JSZip()
  const warnings: string[] = []
  const entries: string[] = []

  const assetName = sanitizeFileName(o.assetName) || 'PixelSprite'
  const assetFolder = o.unity.targetFolder.replace(/^\/+|\/+$/g, '')
  const add = (path: string, content: string | Blob | Uint8Array) => {
    zip.file(path, content)
    entries.push(path)
  }

  // 1. 에셋 본체 — 반드시 1배율이어야 한다.
  const png = await o.encodePng(o.doc, 1)
  add(`${assetFolder}/${assetName}.png`, png)
  add(`${assetFolder}/${assetName}.png.meta`, textureMeta(o.unity, newGuid()))

  // 2. 액터 스크립트
  const cls = sanitizeClassName(o.action.className)
  add(`${assetFolder}/${cls}.cs`, generateActorScript(o.action))

  // 3. 임포트 설정 강제 스크립트 (Editor 폴더 전용)
  if (o.includePostprocessor) {
    add('Assets/Editor/PixelArtImportSettings.cs', importPostprocessor(o.unity))
  }

  // 4. 재편집용 원본 데이터
  if (o.includeSpec) {
    try {
      const spec = toSpec(o.doc)
      add(`${assetName}.spec.json`, JSON.stringify(spec, null, 2))
    } catch (err) {
      if (err instanceof TooManyColorsError) {
        warnings.push(`spec.json 제외: ${err.message}. PNG로는 문제없이 저장됩니다.`)
      } else {
        throw err
      }
    }
  }

  // 5. 확대 미리보기 — 공유용. 유니티에 넣으면 안 된다.
  if (o.previewScale > 1) {
    const preview = await o.encodePng(o.doc, o.previewScale)
    add(`preview/${assetName}@${o.previewScale}x.png`, preview)
  }

  add(
    'README.md',
    readme({
      assetName,
      assetFolder,
      className: cls,
      unity: o.unity,
      includePostprocessor: o.includePostprocessor,
      size: `${o.doc.w}x${o.doc.h}`,
    }),
  )

  // uint8array는 브라우저와 Node 양쪽에서 동일하게 나온다.
  // JSZip의 타입은 버퍼 종류를 특정하지 않아 Blob 생성 시 걸린다. 여기서 좁힌다.
  const bytes = (await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
  })) as Uint8Array<ArrayBuffer>
  return { bytes, filename: `WePixel_${assetName}.zip`, entries, warnings }
}

function sanitizeFileName(raw: string): string {
  return raw.trim().replace(/[^A-Za-z0-9_\-]/g, '')
}

function readme(a: {
  assetName: string
  assetFolder: string
  className: string
  unity: UnityImportOptions
  includePostprocessor: boolean
  size: string
}): string {
  const lines = [
    `# ${a.assetName}`,
    '',
    `We-Pixel에서 내보낸 ${a.size} 픽셀 에셋 패키지입니다.`,
    '',
    '## 배치 방법',
    '',
    '압축을 푼 뒤 `Assets` 폴더를 유니티 프로젝트 루트에 그대로 덮어씁니다.',
    '폴더 구조가 이미 맞춰져 있으므로 파일을 개별로 옮길 필요는 없습니다.',
    '',
    '```',
    `${a.assetFolder}/${a.assetName}.png        스프라이트 (1배율 원본)`,
    `${a.assetFolder}/${a.assetName}.png.meta   임포트 설정`,
    `${a.assetFolder}/${a.className}.cs`.padEnd(a.assetFolder.length + a.className.length + 4) +
      '   액터 스크립트',
  ]
  if (a.includePostprocessor) {
    lines.push('Assets/Editor/PixelArtImportSettings.cs   임포트 설정 강제 (에디터 전용)')
  }
  lines.push(
    '```',
    '',
    '## 확인할 것',
    '',
    `- 스프라이트의 Pixels Per Unit은 **${a.unity.pixelsPerUnit}** 로 설정됩니다.`,
    '  씬 스케일이 어긋나면 이 값을 먼저 확인하세요.',
    '- Filter Mode는 **Point (no filter)** 여야 합니다. 흐릿하게 보이면 이 설정이 풀린 것입니다.',
    '- `.meta` 파일은 유니티 버전에 따라 일부 필드가 무시될 수 있습니다.',
  )
  if (a.includePostprocessor) {
    lines.push(
      '  포함된 `PixelArtImportSettings.cs`가 임포트 시점에 설정을 다시 강제하므로,',
      '  이 스크립트를 `Assets/Editor/` 안에 두면 버전과 무관하게 안전합니다.',
    )
  } else {
    lines.push(
      '  설정이 유실되면 인스펙터에서 직접 Point / Uncompressed로 바꿔주세요.',
    )
  }
  lines.push(
    '',
    '## 액터 스크립트',
    '',
    `\`${a.className}.cs\`의 입력은 레거시 Input Manager를 씁니다.`,
    'Player Settings > Active Input Handling이 `Input System Package (New)` 단독이면',
    '`Both`로 바꿔야 동작합니다.',
    '',
    '`preview/` 폴더의 확대 이미지는 공유용입니다. 유니티에 넣지 마세요.',
    '',
  )
  return lines.join('\n')
}
