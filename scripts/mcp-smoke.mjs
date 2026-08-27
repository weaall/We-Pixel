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
  check('도구 등록', names.length === 8, names.join(', '))

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

  // 색 변형: 형태는 그대로, 팔레트만 바뀌어야 한다
  const variants = await client.callTool({
    name: 'generate_variants',
    arguments: { name: HEART.name, count: 3, hue: 200 },
  })
  const variantText = textOf(variants)
  check(
    'generate_variants 성공',
    !variants.isError && !!imageOf(variants) && variantText.includes(`${HEART.name}-3`),
    variantText.split('\n')[0],
  )

  const baseSpec = await client.callTool({ name: 'get_design', arguments: { name: HEART.name } })
  const variantSpec = await client.callTool({
    name: 'get_design',
    arguments: { name: `${HEART.name}-1` },
  })
  // 문자 이름은 비교하면 안 된다. 저장된 디자인은 작성자가 쓴 문자를 유지하지만
  // 생성된 변형은 toSpec 이 다시 매긴다. 같은 그림이어도 k 가 a 로 바뀐다.
  // 형태란 "어느 칸끼리 같은 색인가" 이므로 그것만 남겨 비교한다.
  const shapeOf = (r) => {
    const rows = textOf(r)
      .split('rows:')[1]
      .trim()
      .split('\n')
      .map((line) => line.trim().replace(/^\d+\s+/, ''))
    const seen = new Map()
    return rows
      .map((row) =>
        [...row]
          .map((ch) => {
            if (!seen.has(ch)) seen.set(ch, seen.size)
            return seen.get(ch)
          })
          .join(','),
      )
      .join('|')
  }
  check('색 변형은 형태를 건드리지 않는다', shapeOf(baseSpec) === shapeOf(variantSpec))

  const rerun = await client.callTool({
    name: 'generate_variants',
    arguments: { name: HEART.name, count: 3, hue: 200 },
  })
  check('같은 인자면 같은 결과', imageOf(variants)?.data === imageOf(rerun)?.data)

  // 주사위 세트: 여섯 개가 같은 배색을 쓰고 눈만 달라야 한다
  const set = await client.callTool({
    name: 'generate_dice_set',
    arguments: { name: 'SmokeSet', preset: '황금', sheet: true },
  })
  const setText = textOf(set)
  check(
    'generate_dice_set 성공',
    !set.isError && !!imageOf(set) && setText.includes('SmokeSet-6'),
    setText.split('\n')[0],
  )
  check(
    '여섯 개 모두 저장',
    [1, 2, 3, 4, 5, 6].every((n) => setText.includes(`SmokeSet-${n}`)),
  )
  check('마주보는 면의 합이 7', setText.includes('(1/4/5)') && setText.includes('(6/2/3)'))
  // 여섯 장이 한 텍스처로 묶여야 유니티에서 인덱스만 바꿔 면을 고를 수 있다.
  check('시트로 묶는다', setText.includes('384x64') && setText.includes('.zip'), (setText.match(/시트: .*/) ?? [''])[0])

  const one = await client.callTool({ name: 'get_design', arguments: { name: 'SmokeSet-1' } })
  const six = await client.callTool({ name: 'get_design', arguments: { name: 'SmokeSet-6' } })
  const paletteOfText = (r) => (textOf(r).match(/palette: (\{[^}]*\})/) ?? [])[1]
  check('세트가 배색을 함께 쓴다', paletteOfText(one) === paletteOfText(six), paletteOfText(one))
  check('눈은 서로 다르다', textOf(one).split('rows:')[1] !== textOf(six).split('rows:')[1])

  const badPreset = await client.callTool({
    name: 'generate_dice_set',
    arguments: { name: 'SmokeBad', preset: '없는것' },
  })
  check('없는 조합은 오류', badPreset.isError === true, textOf(badPreset).split('\n')[0])

  // 버튼: 9-슬라이스라 한 장으로 어떤 크기든 나온다
  const btn = await client.callTool({
    name: 'generate_button',
    arguments: { name: 'SmokeBtn', w: 96, h: 32, preset: '황금', sheet: true },
  })
  const btnText = textOf(btn)
  check('generate_button 성공', !btn.isError && !!imageOf(btn), btnText.split('\n')[0])
  check(
    '네 상태 모두 저장',
    ['normal', 'hover', 'pressed', 'disabled'].every((s) => btnText.includes(`SmokeBtn-${s}`)),
  )
  check('9-슬라이스 시트', btnText.includes('.zip'), (btnText.match(/시트: .*/) ?? [''])[0])

  const wide = await client.callTool({
    name: 'generate_button',
    arguments: { name: 'SmokeWide', w: 192, h: 96 },
  })
  check('임의 크기', !wide.isError && textOf(wide).includes('192x96'))

  const btnNormal = await client.callTool({ name: 'get_design', arguments: { name: 'SmokeBtn-normal' } })
  const btnPressed = await client.callTool({ name: 'get_design', arguments: { name: 'SmokeBtn-pressed' } })
  // 상태가 달라도 형태는 같아야 한다. 크기가 변하면 눌렀을 때 옆 요소가 밀린다.
  const rowsOnly = (r) => textOf(r).split('rows:')[1]
  check('상태가 달라도 형태는 같다', rowsOnly(btnNormal) === rowsOnly(btnPressed))

  const badBtn = await client.callTool({
    name: 'generate_button',
    arguments: { name: 'SmokeBad2', preset: '없는것' },
  })
  check('없는 조합은 오류', badBtn.isError === true)

  const listed = await client.callTool({ name: 'list_designs', arguments: {} })
  const listText = textOf(listed)
  check(
    'list_designs 목록',
    [HEART.name, `${HEART.name}-1`, `${HEART.name}-3`].every((n) => listText.includes(n)),
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
