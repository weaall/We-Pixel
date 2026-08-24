/**
 * MCP 서버를 실제 stdio 클라이언트로 구동해 도구 전체를 훑는다.
 *
 *   npm run mcp:smoke
 *
 * 서버를 붙이기 전에 이걸로 확인해야, 클라이언트 쪽에서 원인을 찾느라 헤매지 않는다.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const OUT_DIR = 'node_modules/.tmp/mcp-smoke'
const results = []
const check = (name, pass, detail = '') =>
  results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)

const textOf = (r) => (r.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n')
const imageOf = (r) => (r.content ?? []).find((c) => c.type === 'image')

// 8x8 하트. 형태가 눈에 보여야 좌표 계산 실수를 잡을 수 있다.
const HEART = {
  name: 'SmokeHeart',
  w: 8,
  h: 8,
  palette: { '.': 'transparent', k: '#2b0b12', r: '#e94560', p: '#ff9bb0' },
  rows: [
    '.kk..kk.',
    'kppkkppk',
    'krrrrrrk',
    'krrrrrrk',
    '.krrrrk.',
    '..krrk..',
    '...kk...',
    '........',
  ],
}

const client = new Client({ name: 'we-pixel-smoke', version: '0.1.0' })
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist-mcp/server.mjs'],
  env: { ...process.env, WE_PIXEL_WORKSPACE: join(OUT_DIR, 'workspace') },
  stderr: 'pipe',
})

await mkdir(OUT_DIR, { recursive: true })
await client.connect(transport)

try {
  const { tools } = await client.listTools()
  const names = tools.map((t) => t.name).sort()
  check('도구 등록', names.length === 7, names.join(', '))

  // draw_design — 잘못된 입력이 조용히 통과하지 않아야 한다
  const bad = await client.callTool({
    name: 'draw_design',
    arguments: { ...HEART, name: 'BadRows', rows: [...HEART.rows.slice(0, 7), 'too-long-row!!'] },
  })
  check('행 길이 검증', bad.isError === true, textOf(bad).split('\n')[0])

  const badChar = await client.callTool({
    name: 'draw_design',
    arguments: { ...HEART, name: 'BadChar', rows: HEART.rows.map((r) => r.replace('k', 'Z')) },
  })
  check('미정의 문자 검증', badChar.isError === true, textOf(badChar).split('\n')[0])

  const traversal = await client.callTool({
    name: 'draw_design',
    arguments: { ...HEART, name: '../escape' },
  })
  check('경로 조작 차단', traversal.isError === true, textOf(traversal).split('\n')[0])

  // 정상 경로
  const drawn = await client.callTool({ name: 'draw_design', arguments: HEART })
  const img = imageOf(drawn)
  check('draw_design 성공', !drawn.isError && !!img)
  check('이미지 동반 반환', img?.mimeType === 'image/png', `${img?.data?.length ?? 0} b64 chars`)

  if (img) {
    const bytes = Buffer.from(img.data, 'base64')
    const sig = bytes.subarray(0, 8).toString('hex')
    check('PNG 시그니처', sig === '89504e470d0a1a0a', sig)
    // IHDR: 8바이트 헤더 + 길이(4) + 'IHDR'(4) 뒤에 width, height
    const w = bytes.readUInt32BE(16)
    const h = bytes.readUInt32BE(20)
    check('미리보기 40배 확대', w === 320 && h === 320, `${w}x${h}`)
    await writeFile(join(OUT_DIR, 'heart-preview.png'), bytes)
  }

  // patch_rows — 마지막 빈 줄에 받침을 넣는다
  const patched = await client.callTool({
    name: 'patch_rows',
    arguments: { name: HEART.name, patches: [{ y: 7, row: '..kbbk..' }], addPalette: { b: '#6b4a2f' } },
  })
  check('patch_rows 성공', !patched.isError, textOf(patched).split('\n')[0])

  const fetched = await client.callTool({ name: 'get_design', arguments: { name: HEART.name } })
  const rowsText = textOf(fetched)
  check('patch 반영 확인', rowsText.includes('..kbbk..'))
  check('get_design 팔레트 포함', rowsText.includes('"b"') && rowsText.includes('#6b4a2f'))

  const missing = await client.callTool({ name: 'get_design', arguments: { name: 'NoSuchThing' } })
  check('없는 디자인 오류', missing.isError === true)

  // 알고리즘 생성기: 시드 고정 시 재현되어야 한다
  const g1 = await client.callTool({
    name: 'generate_sprite',
    arguments: { name: 'SmokeSprite', w: 32, h: 32, seed: 'goblin' },
  })
  const g2 = await client.callTool({
    name: 'generate_sprite',
    arguments: { name: 'SmokeSprite2', w: 32, h: 32, seed: 'goblin' },
  })
  check('시드 재현성', imageOf(g1)?.data === imageOf(g2)?.data)

  const pat = await client.callTool({
    name: 'generate_pattern',
    arguments: { name: 'SmokeTile', w: 32, h: 32, seed: 'grass', seamless: true },
  })
  check('generate_pattern 성공', !pat.isError && !!imageOf(pat))

  const listed = await client.callTool({ name: 'list_designs', arguments: {} })
  const listText = textOf(listed)
  check(
    'list_designs 목록',
    ['SmokeHeart', 'SmokeSprite', 'SmokeSprite2', 'SmokeTile'].every((n) => listText.includes(n)),
  )

  // export
  const exported = await client.callTool({
    name: 'export_unity_package',
    arguments: {
      name: HEART.name,
      className: 'HeartPickup',
      move: 'none',
      jump: false,
      flipSprite: false,
      animate: false,
      notes: '플레이어와 닿으면 체력 회복.',
      pixelsPerUnit: 8,
    },
  })
  const exportText = textOf(exported)
  check('export 성공', !exported.isError, exportText.split('\n')[0])
  check('ZIP 항목 포함', exportText.includes('HeartPickup.cs') && exportText.includes('.png.meta'))

  const zipPath = exportText.split('\n')[0].split(' (')[0]
  const info = await stat(zipPath).catch(() => null)
  check('ZIP 파일 생성', info !== null && info.size > 0, info ? `${info.size} bytes` : '없음')

  // move:none + jump:false 이면 Rigidbody2D가 붙지 않아야 한다
  check('이동 없음 = 물리 미사용', !exportText.includes('Rigidbody2D 기반'))
} finally {
  await client.close()
}

console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('FAIL')).length
console.log(`\n${results.length - failed}/${results.length} 통과`)
process.exit(failed === 0 ? 0 : 1)
