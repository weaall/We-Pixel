# We-Pixel

픽셀 아트를 **자동 생성 → 픽셀 단위 편집 → 유니티용 패키지로 내보내기** 하는 웹 도구입니다.

에디터는 웹 네이티브(React + Canvas)이고, 유니티는 결과물의 소비처입니다.
픽셀 격자를 칠하고 PNG를 뽑는 일에 Unity WebGL을 끼우면 5~15MB 빌드와 재빌드 대기가
붙는데, 정작 유니티가 필요한 부분은 export 포맷뿐이기 때문입니다.
현재 번들은 gzip 92KB입니다.

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

## 기능

**편집** — 펜, 지우개, 채우기, 직선, 사각형(외곽/칠), 스포이드.
브러시 크기 1~8, 좌우/상하 대칭 스탬프, undo/redo 64단계, 4~256px 캔버스.

**자동 생성** — 시드 기반이라 같은 시드는 항상 같은 결과가 나옵니다.

- *스프라이트*: 펄린 노이즈로 덩어리를 만들고 타원형 감쇠로 모은 뒤,
  가장 큰 연결 성분만 남기고 외곽선·명암·포인트 색을 입힙니다.
- *무늬 / 타일*: fBm을 명암 단계로 양자화합니다. 이음선 없는 타일 옵션 포함.

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
scripts/
  preview-sprite.ts      터미널 ASCII 미리보기
```

## 다음 단계

1. **AI 생성 연동** — 위 spec 포맷을 tool use 스키마로 강제해 Claude API에 요청.
   API 키는 브라우저에 둘 수 없으므로 서버 프록시(Node 또는 서버리스 함수)가 필요합니다.
2. **자동 테스트** — 현재 검증은 수동입니다. 개발 중 `pointerup` 좌표가 반영되지 않아
   펜 끝이 잘리고 도형 확정 크기가 미리보기와 어긋나는 버그가 있었는데,
   이런 종류는 회귀 테스트가 있어야 잡힙니다 (vitest + 순수 `core` 단위 테스트).
3. **스프라이트 시트** — 프레임 여러 장을 한 텍스처로 묶고 `.meta`에 슬라이스 정보 기록.
4. **레이어** — 현재는 단일 레이어입니다.
