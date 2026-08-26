import { build } from 'esbuild'

/**
 * Vercel 서버리스 함수 번들을 만든다.
 *
 * esbuild CLI 대신 JS API를 쓰는 이유는 banner 다. AI SDK 의 의존성 중
 * @vercel/oidc 같은 CJS 모듈이 섞여 있는데, ESM 출력에서는 그 안의 require 가
 *   Error: Dynamic require of "path" is not supported
 * 로 죽는다. createRequire 로 require 를 만들어 주면 해결된다.
 * 여러 줄 banner 를 셸 인자로 넘기는 것은 이식성이 없어 스크립트로 뺐다.
 */
const banner = [
  '// 생성된 파일입니다. 편집하지 마세요.',
  '// 소스: server/vercel-generate.ts (npm run build:fn)',
  "import { createRequire as __nodeCreateRequire } from 'node:module'",
  'const require = __nodeCreateRequire(import.meta.url)',
].join('\n')

await build({
  entryPoints: ['server/vercel-generate.ts'],
  outfile: 'api/generate.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  banner: { js: banner },
  logLevel: 'warning',
})

console.log('api/generate.js 생성 완료')
