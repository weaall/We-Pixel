# We-Pixel

픽셀 아트를 **자동 생성 → 픽셀 단위 편집 → 유니티용 패키지로 내보내기** 하는 웹 도구입니다.

에디터는 웹 네이티브(React + Canvas)이고, 유니티는 결과물의 소비처입니다.
픽셀 격자를 칠하고 PNG를 뽑는 일에 Unity WebGL을 끼우면 5~15MB 빌드와 재빌드 대기가
붙는데, 정작 유니티가 필요한 부분은 export 포맷뿐이기 때문입니다.
현재 클라이언트 번들은 gzip 95KB입니다.

## 시작하기

```bash
npm install
npm run dev
```

`http://localhost:5173`

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | 타입 체크 + 프로덕션 빌드 |
| `npm run typecheck` | 타입 체크만 |
| `npm run preview:sprite -- 32 4` | 생성기 출력을 터미널에 ASCII로 확인 |
| `npm run mcp:build` | MCP 서버 번들 빌드 (`dist-mcp/server.mjs`) |
| `npm run mcp:smoke` | MCP 서버 도구 전체를 실제 클라이언트로 검증 |
| `npm run test:repair` | Gemini 응답 보정 로직 테스트 |

## 기능

**편집** — 펜, 지우개, 채우기, 직선, 사각형(외곽/칠), 스포이드.
브러시 크기 1~8, 좌우/상하 대칭 스탬프, undo/redo 64단계, 4~256px 캔버스.

**자동 생성** — 시드 기반이라 같은 시드는 항상 같은 결과가 나옵니다.

- *스프라이트*: 펄린 노이즈로 덩어리를 만들고 타원형 감쇠로 모은 뒤,
  가장 큰 연결 성분만 남기고 외곽선·명암·포인트 색을 입힙니다.
- *무늬 / 타일*: fBm을 명암 단계로 양자화합니다. 이음선 없는 타일 옵션 포함.

**AI 생성** — 프롬프트로 픽셀 아트를 만듭니다. 두 경로가 있습니다.

- *MCP*: Claude Code에서 대화로 지시합니다. API 키가 필요 없습니다.
- *Gemini*: 웹 UI에 프롬프트를 입력합니다. `.env`에 키가 필요합니다.

**내보내기** — 유니티 폴더 구조를 그대로 담은 ZIP입니다.
압축을 풀고 `Assets`를 프로젝트 루트에 덮어쓰면 끝납니다.

```
Assets/WePixel/<Name>.png              스프라이트 (1배율 원본)
Assets/WePixel/<Name>.png.meta         임포트 설정 (Point, 무압축, 밉맵 없음)
Assets/WePixel/<Class>.cs              액터 스크립트
Assets/Editor/PixelArtImportSettings.cs  임포트 설정 강제 (에디터 전용)
<Name>.spec.json                       재편집용 원본 데이터
preview/<Name>@8x.png                  공유용 확대본 (유니티에 넣지 말 것)
README.md
```

## AI 생성

두 경로가 같은 spec 포맷을 공유합니다. 어느 쪽으로 만들어도 결과는 동일한 파일입니다.

### 경로 1 — MCP (권장)

Claude Code 같은 MCP 클라이언트가 이 프로젝트의 도구를 직접 씁니다.
**API 키도, 서버 배포도, 요청당 과금도 없습니다.**

```bash
npm run mcp:build
```

`.mcp.json`이 이미 있으므로 Claude Code를 이 폴더에서 열면 붙습니다.

| 도구 | 하는 일 |
| --- | --- |
| `draw_design` | 팔레트 + 행 문자열로 픽셀을 직접 작성 |
| `patch_rows` | 일부 행만 교체 (전체를 다시 안 보냄) |
| `generate_sprite` | 알고리즘 스프라이트 생성 |
| `generate_pattern` | 알고리즘 무늬 / 타일 생성 |
| `get_design` | 저장된 디자인을 이미지 + 행 데이터로 조회 |
| `list_designs` | 작업 폴더 목록 |
| `export_unity_package` | 유니티 ZIP을 `workspace/exports/`에 기록 |

핵심은 **모든 생성/조회 도구가 렌더된 PNG를 함께 반환**한다는 점입니다.
모델이 자기 결과를 보고 고칠 수 있어야 형태가 제대로 나옵니다.
좌표만 다루면 그림이 무너집니다.

`draw_design`과 `patch_rows`는 호출자가 쓴 팔레트 문자를 그대로 저장합니다.
`toSpec`으로 재도출하면 문자가 등장 순서대로 재배정되어, 뒤이은 `patch_rows`가
자기가 쓴 `k`/`r`를 찾지 못합니다.

### 경로 2 — Gemini 프록시

웹 UI에서 프롬프트를 입력하는 방식입니다.

키를 주는 방법은 둘 중 아무거나 됩니다.

```bash
# A. 셸 환경변수 — 파일을 만들지 않음
GEMINI_API_KEY=여기에_키 npm run dev
```

```bash
# B. .env 파일 — 매번 입력하지 않음
cp .env.example .env
# .env 에 GEMINI_API_KEY 를 채운 뒤 개발 서버 재시작
```

키는 Vite 개발 서버 프로세스에서만 읽히며 **클라이언트 번들에 들어가지 않습니다**.
브라우저에서 직접 호출하면 개발자 도구로 키가 그대로 노출됩니다.
인증은 쿼리스트링이 아니라 `x-goog-api-key` 헤더로 보냅니다. URL은 로그에 남습니다.

Gemini의 `responseSchema`는 동적 키를 표현할 수 없어 팔레트를 배열로 받아
서버에서 레코드로 바꿉니다. 그리고 모델이 행 길이를 틀리는 것은 예외가 아니라
일상이므로, 길이·행 수·미정의 문자를 보정한 뒤 **무엇을 고쳤는지 UI에 알립니다**.
조용히 고치면 품질 저하의 원인을 찾을 수 없게 됩니다.

배포 시에는 `server/gemini.ts`의 핸들러를 서버리스 함수로 옮기면 됩니다.

### 순환 구조

웹 에디터와 MCP 서버는 같은 작업 폴더(`workspace/`)를 씁니다.

```
Claude가 draw_design 으로 그림
   → 웹 에디터의 "작업 폴더"에서 불러와 픽셀 단위로 수정
   → 저장
   → Claude가 get_design 으로 수정 결과를 확인
   → export_unity_package
```

## 설계 메모

### 픽셀 데이터 포맷

팔레트 + 인덱스 그리드를 씁니다.

```json
{
  "w": 32, "h": 32,
  "palette": { ".": "transparent", "a": "#4080bf", "b": "#0e1a25" },
  "rows": ["........aaaa........", "......aabbbbaa......"]
}
```

32×32를 `colorsHex: [...]` 1024개 배열로 표현하면 LLM이 중간에 형태를 놓칩니다.
행 단위 문자열은 토큰이 1/10 수준이고 모델이 그림을 보면서 생성할 수 있어서,
이 포맷을 AI 생성 단계의 계약으로 씁니다.

### 내부 표현

문서는 `Uint8ClampedArray` RGBA 바이트 배열입니다.
`Uint32Array`를 쓰면 채널 순서가 엔디언에 의존하므로 의도적으로 피했습니다.

### 성능

- 오프스크린 버퍼는 문서마다 재사용합니다. 프레임마다 캔버스나 `Sprite`를
  새로 만드는 것이 이 종류 코드에서 가장 흔한 실수입니다.
- 스트로크 중에는 React 상태를 거치지 않고 직접 그립니다.
  `pointermove`마다 `setState`를 하면 렌더 왕복이 입력 지연으로 체감됩니다.
- 확대는 `imageSmoothingEnabled = false`. 픽셀 아트에서 보간은 금물입니다.

### 유니티 임포트

`.meta`는 유니티 버전마다 `serializedVersion`이 달라 100% 보장이 어렵습니다.
그래서 `AssetPostprocessor`를 함께 내보내 임포트 시점에 설정을 다시 강제합니다.
이쪽이 실질적인 안전망입니다.

생성되는 C#은 레거시 Input Manager를 씁니다. Player Settings의
Active Input Handling이 `Input System Package (New)` 단독이면 `Both`로 바꿔야 합니다.

점프를 켜면 `Rigidbody2D` 기반으로 전환됩니다. `transform.Translate`와
`Rigidbody2D`를 섞으면 물리 엔진과 싸우게 되기 때문입니다.
`Rigidbody2D.velocity`는 Unity 6에서 `linearVelocity`로 이름이 바뀌었으므로,
생성 코드는 `#if UNITY_6000_0_OR_NEWER`로 한 곳에서만 분기합니다.

## 구조

```
src/
  core/                  프레임워크 독립 — DOM에 의존하지 않음
    color.ts             RGBA 파싱/변환, HSL
    doc.ts               PixelDoc 모델
    codec.ts             팔레트 + 인덱스 그리드 직렬화
    tools.ts             스탬프, Bresenham, 사각형, 스캔라인 플러드 필
    history.ts           스냅샷 기반 undo/redo
    render.ts            캔버스 렌더러 (core 중 유일하게 DOM 사용)
    generate/
      rng.ts             mulberry32 시드 난수
      perlin.ts          2D 펄린 / fBm
      sprite.ts          스프라이트 생성기
      pattern.ts         무늬 / 타일 생성기
  export/
    png.ts               PNG 인코딩 / 디코딩 / 다운로드
    unityMeta.ts         .meta + AssetPostprocessor 생성
    csharp.ts            액터 스크립트 생성
    package.ts           ZIP 패키징
  ui/                    React 컴포넌트
mcp/
  server.ts              MCP 서버 (stdio)
  png.ts                 Node PNG 인코더 (zlib, 의존성 없음)
  workspace.ts           spec 파일 IO + 경로 검증
server/
  gemini.ts              Gemini 프록시 (Vite 개발 서버 미들웨어)
  workspaceApi.ts        작업 폴더 API — 에디터와 MCP를 잇는다
scripts/
  preview-sprite.ts      터미널 ASCII 미리보기
  mcp-smoke.mjs          MCP 도구 통합 검증
  repair-test.ts         Gemini 응답 보정 테스트
```

## 다음 단계

1. **`core` 단위 테스트** — MCP와 보정 로직에는 검증 스크립트가 있지만
   에디터 도구(`tools.ts`, `history.ts`)는 아직 수동 검증입니다.
   개발 중 `pointerup` 좌표가 반영되지 않아 펜 끝이 잘리고 도형 확정 크기가
   미리보기와 어긋나는 버그가 있었는데, 이런 종류는 회귀 테스트가 있어야 잡힙니다.
2. **스프라이트 시트** — 프레임 여러 장을 한 텍스처로 묶고 `.meta`에 슬라이스 정보 기록.
   MCP에 `add_frame` 도구를 붙이면 애니메이션도 대화로 만들 수 있습니다.
3. **레이어** — 현재는 단일 레이어입니다.
4. **Gemini 프록시 배포** — 지금은 개발 서버 전용입니다.
