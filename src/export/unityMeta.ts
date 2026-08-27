/**
 * 유니티 텍스처 임포트 설정.
 *
 * .meta 파일은 유니티 버전마다 serializedVersion이 달라서 100% 보장이 어렵다.
 * (유니티가 조용히 업그레이드하거나, 모르는 필드는 기본값으로 채운다.)
 * 그래서 .meta와 함께 AssetPostprocessor도 내보낸다. 후자는 버전에 무관하게
 * 임포트 시점에 설정을 강제하므로 실질적인 안전망이다.
 */

export interface UnityImportOptions {
  /** 스프라이트 1유닛에 해당하는 픽셀 수. 보통 텍스처 크기나 16/32를 쓴다. */
  pixelsPerUnit: number
  /** 에셋을 넣을 폴더. AssetPostprocessor가 이 경로로 필터한다. */
  targetFolder: string
  /**
   * 늘리지 않고 그대로 두는 가장자리 폭 (9-슬라이스).
   *
   * 버튼처럼 가운데만 늘어나는 그림에 쓴다. 이것이 없으면 유니티가 통째로
   * 늘려 둥근 모서리가 뭉개진다.
   */
  border?: { left: number; bottom: number; right: number; top: number }
}

export const defaultImportOptions: UnityImportOptions = {
  pixelsPerUnit: 32,
  targetFolder: 'Assets/WePixel',
}

/** 유니티 GUID는 32자리 소문자 hex. */
export function newGuid(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface SpriteSlice {
  name: string
  /** 왼쪽 위 기준 좌표. 이 함수가 유니티의 아래 기준으로 뒤집는다. */
  x: number
  y: number
  w: number
  h: number
}

/**
 * 유니티 스프라이트의 내부 id.
 *
 * 0 이면 유니티가 임포트할 때 새로 매기고, 그러면 이미 씬에 놓인 참조가 끊긴다.
 * 이름에서 뽑아 항상 같은 값이 나오게 한다 — 다시 내보내도 참조가 유지된다.
 */
function internalId(name: string): number {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  // 음수와 0을 피한다.
  return (h >>> 1) + 1
}

/** 이름에서 뽑는 GUID 꼴 32자리. 다시 내보내도 같아야 참조가 유지된다. */
function stableId(name: string): string {
  let out = ''
  let h = internalId(name)
  while (out.length < 32) {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    out += (h >>> 0).toString(16).padStart(8, '0')
  }
  return out.slice(0, 32)
}

/**
 * 여러 장을 담은 텍스처의 .meta.
 *
 * 유니티의 rect 는 텍스처 아래에서 잰다. 화면 좌표 그대로 넣으면 위아래가
 * 뒤집힌 채 잘린다.
 */
export function spriteSheetMeta(
  opts: UnityImportOptions,
  slices: ReadonlyArray<SpriteSlice>,
  sheetHeight: number,
  guid = newGuid(),
): string {
  const single = textureMeta(opts, guid)

  const table = slices
    .map((s) => `  - first:\n      213: ${internalId(s.name)}\n    second: ${s.name}`)
    .join('\n')

  const list = slices
    .map((s) => {
      const bottom = sheetHeight - s.y - s.h
      return [
        '    - serializedVersion: 2',
        `      name: ${s.name}`,
        '      rect:',
        '        serializedVersion: 2',
        `        x: ${s.x}`,
        `        y: ${bottom}`,
        `        width: ${s.w}`,
        `        height: ${s.h}`,
        '      alignment: 0',
        '      pivot: {x: 0.5, y: 0.5}',
        `      border: {x: ${opts.border?.left ?? 0}, y: ${opts.border?.bottom ?? 0}, z: ${opts.border?.right ?? 0}, w: ${opts.border?.top ?? 0}}`,
        '      outline: []',
        '      physicsShape: []',
        '      tessellationDetail: 0',
        '      bones: []',
        `      spriteID: ${stableId(s.name)}`,
        `      internalID: ${internalId(s.name)}`,
        '      vertices: []',
        '      indices: ',
        '      edges: []',
        '      weights: []',
      ].join('\n')
    })
    .join('\n')

  return single
    .replace('  internalIDToNameTable: []', `  internalIDToNameTable:\n${table}`)
    .replace('  spriteMode: 1', '  spriteMode: 2')
    .replace('    sprites: []', `    sprites:\n${list}`)
}

export function textureMeta(opts: UnityImportOptions, guid = newGuid()): string {
  return `fileFormatVersion: 2
guid: ${guid}
TextureImporter:
  internalIDToNameTable: []
  externalObjects: {}
  serializedVersion: 12
  mipmaps:
    mipMapMode: 0
    enableMipMap: 0
    sRGBTexture: 1
    linearTexture: 0
    fadeOut: 0
    borderMipMap: 0
    mipMapsPreserveCoverage: 0
    alphaTestReferenceValue: 0.5
    mipMapFadeDistanceStart: 1
    mipMapFadeDistanceEnd: 3
  bumpmap:
    convertToNormalMap: 0
    externalNormalMap: 0
    heightScale: 0.25
    normalMapFilter: 0
  isReadable: 0
  streamingMipmaps: 0
  streamingMipmapsPriority: 0
  vTOnly: 0
  ignoreMasterTextureLimit: 0
  grayScaleToAlpha: 0
  generateCubemap: 6
  cubemapConvolution: 0
  seamlessCubemap: 0
  textureFormat: 1
  maxTextureSize: 2048
  textureSettings:
    serializedVersion: 2
    filterMode: 0
    aniso: 1
    mipBias: 0
    wrapU: 1
    wrapV: 1
    wrapW: 1
  nPOTScale: 0
  lightmap: 0
  compressionQuality: 50
  spriteMode: 1
  spriteExtrude: 1
  spriteMeshType: 1
  alignment: 0
  spritePivot: {x: 0.5, y: 0.5}
  spritePixelsToUnits: ${opts.pixelsPerUnit}
  spriteBorder: {x: ${opts.border?.left ?? 0}, y: ${opts.border?.bottom ?? 0}, z: ${opts.border?.right ?? 0}, w: ${opts.border?.top ?? 0}}
  spriteGenerateFallbackPhysicsShape: 1
  alphaUsage: 1
  alphaIsTransparency: 1
  spriteTessellationDetail: -1
  textureType: 8
  textureShape: 1
  singleChannelComponent: 0
  flipbookRows: 1
  flipbookColumns: 1
  maxTextureSizeSet: 0
  compressionQualitySet: 0
  textureFormatSet: 0
  ignorePngGamma: 0
  applyGammaDecoding: 0
  platformSettings:
  - serializedVersion: 3
    buildTarget: DefaultTexturePlatform
    maxTextureSize: 2048
    resizeAlgorithm: 0
    textureFormat: -1
    textureCompression: 0
    compressionQuality: 50
    crunchedCompression: 0
    allowsAlphaSplitting: 0
    overridden: 0
    androidETC2FallbackOverride: 0
    forceMaximumCompressionQuality_BC6H_BC7: 0
  spriteSheet:
    serializedVersion: 2
    sprites: []
    outline: []
    physicsShape: []
    bones: []
    spriteID: 5e97eb03825dee720800000000000000
    internalID: 0
    vertices: []
    indices:
    edges: []
    weights: []
    secondaryTextures: []
    nameFileIdTable: {}
  mipmapLimitGroupName:
  pSDRemoveMatte: 0
  userData:
  assetBundleName:
  assetBundleVariant:
`
}

/** 버전에 무관하게 임포트 설정을 강제하는 에디터 스크립트. Editor 폴더에 두어야 한다. */
export function importPostprocessor(opts: UnityImportOptions): string {
  const folder = opts.targetFolder.replace(/\/+$/, '')
  return `using UnityEditor;
using UnityEngine;

/// <summary>
/// We-Pixel로 내보낸 스프라이트의 임포트 설정을 강제한다.
///
/// .meta 파일만으로는 유니티 버전에 따라 설정이 유실될 수 있으므로,
/// 이 스크립트가 실제 안전망 역할을 한다.
/// 반드시 Editor 폴더 안에 두어야 한다 (예: Assets/Editor/).
/// </summary>
public class PixelArtImportSettings : AssetPostprocessor
{
    const string TargetFolder = "${folder}/";
    const float PixelsPerUnit = ${opts.pixelsPerUnit}f;

    void OnPreprocessTexture()
    {
        if (!assetPath.Replace('\\', '/').StartsWith(TargetFolder))
            return;

        var importer = (TextureImporter)assetImporter;

        importer.textureType = TextureImporterType.Sprite;

        // 시트는 건드리지 않는다. Single 로 되돌리면 .meta 의 슬라이스가 지워져
        // 여섯 칸이 한 장으로 합쳐진다.
        if (importer.spriteImportMode != SpriteImportMode.Multiple)
            importer.spriteImportMode = SpriteImportMode.Single;
        importer.spritePixelsPerUnit = PixelsPerUnit;

        // 픽셀 아트의 필수 조건: 보간 금지, 압축 금지, 밉맵 금지.
        importer.filterMode = FilterMode.Point;
        importer.textureCompression = TextureImporterCompression.Uncompressed;
        importer.mipmapEnabled = false;

        importer.alphaIsTransparency = true;
        importer.wrapMode = TextureWrapMode.Clamp;
        importer.npotScale = TextureImporterNPOTScale.None;
    }
}
`
}
