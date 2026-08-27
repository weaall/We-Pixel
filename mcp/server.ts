#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import type { PixelSpec } from '../src/core/codec'
import { fromSpec, toSpec, TRANSPARENT_CHAR } from '../src/core/codec'
import type { PixelDoc } from '../src/core/doc'
import { MAX_SIZE, MIN_SIZE } from '../src/core/doc'
import { defaultVariantSetOptions, makeVariants } from '../src/core/generate/variants'
import {
  DICE_PRESETS,
  DICE_ROLE_LIST,
  diceSetSpecsToned,
  diceSetSpecsFromRoles,
} from '../src/core/generate/diceSet'
import { defaultActionSpec } from '../src/export/csharp'
import { buildPackage } from '../src/export/package'
import { defaultImportOptions } from '../src/export/unityMeta'

import { encodePng, encodePngAsync, toBase64 } from './png'
import {
  exportsDir,
  listSpecs,
  loadSpec,
  saveSpec,
  workspaceRoot,
  writeExport,
} from '../server/workspace'

/**
 * We-Pixel MCP 서버.
 *
 * 이 서버의 목적은 모델이 픽셀 아트를 "보면서" 만들 수 있게 하는 것이다.
 * 모든 생성/조회 도구는 렌더된 PNG를 이미지로 돌려주므로, 모델이 자기 결과를
 * 확인하고 고치는 반복이 가능하다. 그림 없이 좌표만 다루면 형태가 무너진다.
 *
 * stdio 전송이므로 stdout에는 프로토콜 메시지만 나가야 한다. 로그는 stderr로.
 */

const server = new McpServer({ name: 'we-pixel', version: '0.1.0' })

/** 모델이 형태를 알아볼 수 있도록 대략 이 크기까지 확대해 이미지를 돌려준다. */
const PREVIEW_TARGET_PX = 320

function previewScale(doc: PixelDoc): number {
  return Math.max(1, Math.floor(PREVIEW_TARGET_PX / Math.max(doc.w, doc.h)))
}

type ToolResult = {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
  >
  isError?: boolean
}

function ok(text: string): ToolResult {
  return { content: [{ type: 'text', text }] }
}

function fail(err: unknown): ToolResult {
  const message = err instanceof Error ? err.message : String(err)
  return { content: [{ type: 'text', text: `오류: ${message}` }], isError: true }
}

/** rows에 '.'을 썼는데 팔레트에 없으면 채워 둔다. fromSpec은 관대하지만 저장 파일은 자족해야 한다. */
function normalizeSpec(spec: PixelSpec): PixelSpec {
  if (!spec.rows.some((r) => r.includes(TRANSPARENT_CHAR)) || spec.palette[TRANSPARENT_CHAR]) {
    return spec
  }
  return { ...spec, palette: { ...spec.palette, [TRANSPARENT_CHAR]: 'transparent' } }
}

/**
 * 문서를 저장하고, 확대 PNG를 함께 붙여 돌려준다.
 *
 * authored를 넘기면 그 spec을 그대로 저장한다. toSpec으로 재도출하면 팔레트 문자가
 * 등장 순서대로 재배정되어, 호출자가 쓴 'k'/'r' 같은 매핑이 사라진다.
 * 그러면 뒤이은 patch_rows가 자기가 쓴 문자를 찾지 못한다.
 */
async function designResult(
  name: string,
  doc: PixelDoc,
  note: string,
  authored?: PixelSpec,
): Promise<ToolResult> {
  const spec = authored ? normalizeSpec(authored) : toSpec(doc)
  const path = await saveSpec(name, spec)
  const scale = previewScale(doc)

  return {
    content: [
      {
        type: 'text',
        text: [
          note,
          `저장: ${path}`,
          `크기: ${doc.w}x${doc.h}, 색상 ${Object.keys(spec.palette).length}종`,
          `아래 이미지는 ${scale}배로 확대한 미리보기입니다. 형태를 확인하고 고칠 부분이 있으면`,
          `patch_rows 로 해당 행만 바꾸거나 draw_design 으로 다시 그리세요.`,
        ].join('\n'),
      },
      { type: 'image', data: toBase64(encodePng(doc, scale)), mimeType: 'image/png' },
    ],
  }
}

const nameArg = z
  .string()
  .describe('작업 폴더에 저장될 이름. 영문/숫자/밑줄/하이픈만.')

const sizeArg = z.number().int().min(MIN_SIZE).max(MAX_SIZE)

// ---------------------------------------------------------------------------
// draw_design — 모델이 픽셀 그리드를 직접 작성한다. 이 서버의 중심 도구.
// ---------------------------------------------------------------------------

server.registerTool(
  'draw_design',
  {
    title: '픽셀 디자인 직접 그리기',
    description: [
      '팔레트와 행 문자열로 픽셀 아트를 직접 작성한다.',
      '"고블린을 그려줘" 같은 구체적 요청은 알고리즘 생성기로는 불가능하므로 이 도구를 쓴다.',
      '',
      'rows는 길이 h의 배열이고, 각 문자열은 정확히 w글자여야 한다.',
      "각 글자는 palette의 키이며, '.' 은 투명으로 예약되어 있다.",
      '',
      '예시 (4x3):',
      '  palette: { ".": "transparent", "k": "#1a1a2e", "r": "#e94560" }',
      '  rows: [".kk.", "krrk", ".kk."]',
      '',
      '결과 이미지가 함께 반환되므로 형태를 확인하고 다시 고칠 수 있다.',
      '픽셀 아트는 16~64px에서 색을 4~12종으로 제한하고, 외곽선을 어둡게 두면 형태가 살아난다.',
    ].join('\n'),
    inputSchema: {
      name: nameArg,
      w: sizeArg.describe('가로 픽셀 수'),
      h: sizeArg.describe('세로 픽셀 수'),
      palette: z
        .record(z.string(), z.string())
        .describe('문자 -> "#rrggbb" | "#rrggbbaa" | "transparent". 키는 한 글자.'),
      rows: z.array(z.string()).describe('길이 h, 각 문자열 길이 w'),
    },
  },
  async ({ name, w, h, palette, rows }) => {
    try {
      const spec: PixelSpec = { w, h, palette, rows }
      // fromSpec이 행 길이와 미정의 문자를 검증한다. 여기서 걸러야 조용히 깨지지 않는다.
      const doc = fromSpec(spec)
      return await designResult(name, doc, `"${name}" 을 그렸습니다.`, spec)
    } catch (err) {
      return fail(err)
    }
  },
)

// ---------------------------------------------------------------------------
// patch_rows — 일부 행만 교체. 32행을 다시 보내지 않고 3행만 고칠 때.
// ---------------------------------------------------------------------------

server.registerTool(
  'patch_rows',
  {
    title: '일부 행만 수정',
    description: [
      '기존 디자인의 특정 행만 교체한다.',
      '전체 그리드를 다시 보내지 않고 몇 줄만 고칠 때 쓴다.',
      '새 팔레트 항목이 필요하면 addPalette로 함께 넘긴다.',
    ].join('\n'),
    inputSchema: {
      name: nameArg,
      patches: z
        .array(
          z.object({
            y: z.number().int().min(0).describe('0부터 시작하는 행 번호'),
            row: z.string().describe('해당 행 전체를 대체할 문자열. 길이는 w와 같아야 한다.'),
          }),
        )
        .min(1),
      addPalette: z
        .record(z.string(), z.string())
        .optional()
        .describe('새로 쓸 팔레트 항목. 기존 항목과 병합된다.'),
    },
  },
  async ({ name, patches, addPalette }) => {
    try {
      const spec = await loadSpec(name)
      const rows = [...spec.rows]
      for (const { y, row } of patches) {
        if (y >= spec.h) throw new Error(`행 ${y} 는 범위를 벗어납니다 (h=${spec.h}).`)
        if (row.length !== spec.w) {
          throw new Error(`행 ${y} 의 길이가 ${row.length}인데 w는 ${spec.w}입니다.`)
        }
        rows[y] = row
      }
      const next: PixelSpec = {
        ...spec,
        palette: { ...spec.palette, ...(addPalette ?? {}) },
        rows,
      }
      const doc = fromSpec(next)
      return await designResult(
        name,
        doc,
        `"${name}" 의 ${patches.length}개 행을 수정했습니다.`,
        next,
      )
    } catch (err) {
      return fail(err)
    }
  },
)

// ---------------------------------------------------------------------------
// generate_sprite / generate_pattern — 알고리즘 생성. 시작점이나 배경용.
// ---------------------------------------------------------------------------

server.registerTool(
  'generate_dice_set',
  {
    title: '주사위 세트 만들기',
    description: [
      '윗면이 1~6 인 주사위 여섯 개를 한 벌로 만든다.',
      '',
      '형태는 사람이 그린 참고 주사위에서 뜬 것이라 그리지 않는다. 정하는 것은 색뿐이다.',
      '여섯 개가 배색 하나를 함께 쓰므로 세트로 보인다 — 장마다 색을 따로 정하면',
      '따로 만든 주사위처럼 보인다.',
      '',
      '자리마다 이름이 있다:',
      ...DICE_ROLE_LIST.map((e) => `  ${e.role} (지금 ${e.hex})`),
      '',
      'palette 를 주면 그대로 쓰고, 비우면 preset 또는 hue 로 정한다.',
      `preset: ${DICE_PRESETS.map((p) => p.name).join(', ')}`,
      '',
      '밝기 순서를 지켜야 입체감이 산다: edge > faceLit > faceEdge > faceShade > outline.',
    ].join('\n'),
    inputSchema: {
      name: nameArg.describe('저장 이름의 접두어. "Fire" 면 Fire-1 ... Fire-6 으로 저장된다.'),
      hue: z.number().min(0).max(360).default(0).describe('목표 색조. palette 를 주면 무시된다.'),
      saturation: z.number().min(0).max(2).default(1).describe('채도 배율.'),
      contrast: z.number().min(0.2).max(2).default(1).describe('명암 폭 배율.'),
      brightness: z.number().min(-0.3).max(0.3).default(0).describe('밝기 이동.'),
      preset: z.string().optional().describe('미리 만들어 둔 조합 이름.'),
      pipHue: z.number().min(0).max(360).optional().describe('눈만 따로 옮길 색조.'),
      palette: z
        .array(z.object({ char: z.string(), hex: z.string() }))
        .optional()
        .describe('직접 정한 배색. char 는 위 자리 이름, hex 는 "#rrggbb".'),
    },
  },
  async ({ name, hue, saturation, contrast, brightness, preset, pipHue, palette }) => {
    try {
      const named = preset
        ? DICE_PRESETS.find((p) => p.name === preset)
        : undefined
      if (preset && !named) {
        return fail(
          new Error(`"${preset}" 는 없는 조합입니다. ${DICE_PRESETS.map((p) => p.name).join(', ')} 중에 고르세요.`),
        )
      }

      const set =
        palette && palette.length > 0
          ? diceSetSpecsFromRoles(palette)
          : named
            ? diceSetSpecsToned(named.tone)
            : diceSetSpecsToned({
                body: { hue, saturation, saturationBoost: 0.3, contrast, brightness },
                // 눈은 몸통과 따로 움직인다. 안 그러면 붉은 눈이 몸통을 따라간다.
                pip: {
                  hue: pipHue ?? 350,
                  saturation: 1,
                  saturationBoost: 0,
                  contrast: 1,
                  brightness: 0,
                },
              })

      const saved: string[] = []
      // spec 을 그대로 저장한다. toSpec 으로 다시 매기면 장마다 문자가 달라진다.
      for (const d of set) saved.push(await saveSpec(`${name}-${d.top}`, d.spec))

      const preview = fromSpec(set[5].spec)
      const scale = previewScale(preview)
      return {
        content: [
          {
            type: 'text',
            text: [
              `주사위 세트 여섯 개를 만들었습니다.`,
              ...set.map((d, i) => `  윗면 ${d.top} (${d.pips.join('/')}) -> ${saved[i]}`),
              '보이는 세 면은 위/왼쪽/오른쪽이고 마주보는 면의 합은 7입니다.',
              `아래 이미지는 윗면 6 을 ${scale}배로 확대한 것입니다.`,
            ].join('\n'),
          },
          {
            type: 'image',
            data: toBase64(encodePng(preview, scale)),
            mimeType: 'image/png',
          },
        ],
      }
    } catch (err) {
      return fail(err)
    }
  },
)

server.registerTool(
  'generate_variants',
  {
    title: '색 변형 만들기',
    description: [
      '저장된 디자인의 색만 바꿔 여러 벌을 만든다.',
      '팔레트만 옮기므로 형태는 한 픽셀도 달라지지 않는다 — 같은 주사위의 다른 색,',
      '같은 갑옷의 다른 등급처럼 세트를 뽑을 때 쓴다.',
      '',
      '원본의 대표 색조에서 각 색이 얼마나 벗어나 있었는지를 그대로 옮기므로',
      '밝은 면은 따뜻하고 그늘은 차가운 픽셀 아트의 색 배치가 유지된다.',
    ].join('\n'),
    inputSchema: {
      name: nameArg.describe('원본 디자인 이름.'),
      count: z.number().int().min(1).max(12).default(4).describe('만들 벌 수.'),
      hue: z.number().min(0).max(360).default(30).describe('첫 변형의 색조.'),
      step: z
        .number()
        .min(0)
        .max(180)
        .default(0)
        .describe('변형 사이 색조 간격. 0이면 360도를 고르게 나눈다.'),
      saturation: z.number().min(0).max(2).default(1).describe('채도 배율.'),
      contrast: z.number().min(0.2).max(2).default(1).describe('명암 폭 배율.'),
      brightness: z.number().min(-0.3).max(0.3).default(0).describe('밝기 이동.'),
      keepNeutral: z
        .boolean()
        .default(true)
        .describe('외곽선처럼 채도가 없는 색은 그대로 둔다.'),
      prefix: z.string().optional().describe('저장 이름 접두어. 비우면 원본 이름을 쓴다.'),
    },
  },
  async ({ name, count, hue, step, saturation, contrast, brightness, keepNeutral, prefix }) => {
    try {
      const source = fromSpec(await loadSpec(name))
      const variants = makeVariants(source, {
        ...defaultVariantSetOptions,
        count,
        hue,
        step,
        saturation,
        contrast,
        brightness,
        keepNeutral,
      })

      const base = prefix ?? name
      const saved: string[] = []
      for (const [i, v] of variants.entries()) {
        saved.push(await saveSpec(`${base}-${i + 1}`, toSpec(v.doc)))
      }

      const scale = previewScale(source)
      return {
        content: [
          {
            type: 'text',
            text: [
              `"${name}" 의 색 변형 ${variants.length}벌을 만들었습니다.`,
              ...saved.map((path, i) => `  ${Math.round(variants[i].hue)}도 -> ${path}`),
              '형태는 원본과 동일합니다. 팔레트만 바뀌었습니다.',
              `아래 이미지는 첫 변형을 ${scale}배로 확대한 것입니다.`,
            ].join('\n'),
          },
          {
            type: 'image',
            data: toBase64(encodePng(variants[0].doc, scale)),
            mimeType: 'image/png',
          },
        ],
      }
    } catch (err) {
      return fail(err)
    }
  },
)

server.registerTool(
  'get_design',
  {
    title: '디자인 불러오기',
    description: [
      '저장된 디자인을 이미지와 행 데이터로 함께 반환한다.',
      '사용자가 웹 에디터에서 직접 고친 결과를 확인할 때도 이 도구를 쓴다.',
    ].join('\n'),
    inputSchema: { name: nameArg },
  },
  async ({ name }) => {
    try {
      const spec = await loadSpec(name)
      const doc = fromSpec(spec)
      const scale = previewScale(doc)
      return {
        content: [
          {
            type: 'text',
            text: [
              `"${name}" — ${spec.w}x${spec.h}`,
              `palette: ${JSON.stringify(spec.palette)}`,
              'rows:',
              ...spec.rows.map((r, i) => `${String(i).padStart(2, ' ')} ${r}`),
            ].join('\n'),
          },
          { type: 'image', data: toBase64(encodePng(doc, scale)), mimeType: 'image/png' },
        ],
      }
    } catch (err) {
      return fail(err)
    }
  },
)

server.registerTool(
  'list_designs',
  {
    title: '디자인 목록',
    description: '작업 폴더에 저장된 디자인 목록을 최근 수정 순으로 반환한다.',
    inputSchema: {},
  },
  async () => {
    try {
      const specs = await listSpecs()
      if (specs.length === 0) {
        return ok(`작업 폴더가 비어 있습니다: ${workspaceRoot()}`)
      }
      return ok(
        [
          `작업 폴더: ${workspaceRoot()}`,
          '',
          ...specs.map((s) => `${s.name}  ${s.size}  ${s.colors}색  ${s.modified}`),
        ].join('\n'),
      )
    } catch (err) {
      return fail(err)
    }
  },
)

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------

server.registerTool(
  'export_unity_package',
  {
    title: '유니티 패키지로 내보내기',
    description: [
      '디자인을 유니티 폴더 구조 그대로의 ZIP으로 내보낸다.',
      'PNG, 임포트 설정 .meta, AssetPostprocessor, 액터 C# 스크립트, 재편집용 spec.json이 들어간다.',
      `저장 위치: ${exportsDir()}`,
    ].join('\n'),
    inputSchema: {
      name: nameArg,
      className: z.string().default(defaultActionSpec.className).describe('생성될 C# 클래스명'),
      move: z.enum(['none', 'horizontal', 'topDown']).default(defaultActionSpec.move),
      jump: z.boolean().default(defaultActionSpec.jump).describe('켜면 Rigidbody2D 기반이 된다'),
      flipSprite: z.boolean().default(defaultActionSpec.flipSprite),
      animate: z.boolean().default(defaultActionSpec.animate),
      moveSpeed: z.number().default(defaultActionSpec.moveSpeed),
      jumpForce: z.number().default(defaultActionSpec.jumpForce),
      animFps: z.number().default(defaultActionSpec.animFps),
      notes: z.string().default('').describe('생성 코드 상단 주석에 들어갈 요구사항'),
      pixelsPerUnit: z.number().int().min(1).default(defaultImportOptions.pixelsPerUnit),
      previewScale: z.number().int().min(0).max(16).default(8),
    },
  },
  async (args) => {
    try {
      const doc = fromSpec(await loadSpec(args.name))
      const res = await buildPackage({
        doc,
        assetName: args.name,
        action: {
          className: args.className,
          move: args.move,
          jump: args.jump,
          flipSprite: args.flipSprite,
          animate: args.animate,
          moveSpeed: args.moveSpeed,
          jumpForce: args.jumpForce,
          animFps: args.animFps,
          notes: args.notes,
        },
        unity: {
          pixelsPerUnit: args.pixelsPerUnit,
          targetFolder: defaultImportOptions.targetFolder,
        },
        includePostprocessor: true,
        includeSpec: true,
        previewScale: args.previewScale,
        encodePng: encodePngAsync,
      })

      const path = await writeExport(res.filename, res.bytes)
      return ok(
        [
          `${path} (${res.bytes.length.toLocaleString()} bytes)`,
          '',
          '담긴 파일:',
          ...res.entries.map((e) => `  ${e}`),
          ...(res.warnings.length > 0 ? ['', '주의:', ...res.warnings.map((w) => `  ${w}`)] : []),
          '',
          '압축을 풀고 Assets 폴더를 유니티 프로젝트 루트에 덮어쓰면 됩니다.',
        ].join('\n'),
      )
    } catch (err) {
      return fail(err)
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
console.error(`we-pixel MCP 서버 시작. 작업 폴더: ${workspaceRoot()}`)
