# Gate 1: personal-color-report 실제 입출력 검증

- 일시: 2026-11-24. 판정: **PASS** (HIL은 별도)
- 실행: `pnpm --filter @celeber/personal-color-report dev` (3105). 키는 `set -a; source .env; set +a`로만 올렸고 `CELEBER_FORCE_MOCK`은 설정하지 않았다. 공유 DB를 건드리지 않도록 `CELEBER_DATA_DIR`를 작업용 임시 폴더로 따로 지정했다. 검증이 끝난 뒤 서버를 종료했다.
- 브라우저: Playwright 1.64.1(npx 캐시)과 Chromium headless를 썼다. 390×844 @2x, 가짜 카메라를 켰다.

## 입력

| 시나리오 | 얼굴(환경 겸용) | 전신 | 스타일 |
|---|---|---|---|
| A | 레퍼런스 카드의 업로드 사진 부분을 잘라 2배로 키운 사진 | 건너뜀 | 남성(사진 기반 기본값) |
| B | `pocs/core/fixtures/demo-people/look-a.jpg` 머리 부분 크롭 | 같은 사진의 아래쪽 여백을 늘린 사진 | 선택 안 함 → API에서 여성 |

선행 데이터는 실제 UI 업로드 경로로 만들었다. 환경 → 정면(브라우저 MediaPipe 랜드마크) → 측면 건너뜀 → 전신 순서로 진행했고, 그 과정에서 `/api/face/environment`, `/api/face/analyze`, `/api/body/analyze`가 실제로 호출됐다. 이어서 같은 세션으로 `/api/report/generate`를 직접 호출했다.

## 결과

| 항목 | 결과 |
|---|---|
| `/pocs/personal-color-report` 접근 | 수정 전 404. 수정 후 `/pocs/personal-color-report` → 307 `/`, `/pocs/personal-color-report/<경로>?<쿼리>` → 307 `/<경로>?<쿼리>` |
| 실제 공급자 | Anthropic 400(사용 한도, 12-01까지) → OpenAI `gpt-6.2-sol`. 생성 4회 모두 `aiSource: 'ai'`, `source: 'hybrid'`, `isMock: false`, 데모 배지 없음. 19~23초 |
| zod 계약 | 생성 응답 4개, PATCH 2개, GET, latest, 목록, inputs가 모두 통과했다(`test/live-response.test.ts`, 9건) |
| 오류 경로 | 없는 세션 404 `face_not_found`, 빈 id 400 `validation_error` |
| 변형 | PATCH female → 제목·⑥⑦⑧⑩ 라벨(베이스/립/아이/치크)이 바뀜. male로 되돌리면 AI 그루밍 문구가 복원됨 |
| 12개 항목 | 업로드 사진, ①첫인상, ②타입, ③웜/쿨, ④특징, ⑤드레이핑, ⑥셔츠, ⑦수트, ⑧넥타이·악세서리, ⑨헤어, ⑩그루밍, ⑪비추천, 전신(B), 12~14 모두 렌더링됨. 페이지 오류 0 |

### 사진과의 일치

- A: 규칙 판정은 **여름쿨 뮤트**, 보조 타입은 여름쿨 라이트, 웜 37 / 쿨 63, 신뢰도 88이다. AI 독립 판정도 summer-mute로 같았다. 레퍼런스 카드(여름쿨 뮤트, 보조 여름쿨 라이트, 웜 24 / 쿨 76, 87%)와 타입·보조 타입이 같고, 웜/쿨 비율은 방향이 같다. 첫인상("짙은 모발과 눈동자", "어두운 네이비 상의")과 드레이핑 베스트(소프트 블루)·워스트(머스타드)도 카드와 맞는다. 두 번 생성했을 때 같은 타입이 나왔다.
- B: 규칙 판정은 **봄웜 브라이트**(보조 가을웜 딥), 웜 81, 신뢰도 94이고 AI 판정과 같았다. 서술("골든 베이지 기", "센터 가르마", "밝은 베이지 상의")이 사진과 맞는다. 전신은 7.9등신·역삼각형이며 ⑪ 아래에 실루엣 제안이 나온다.

## 고친 버그 (pocs/personal-color-report 안)

1. `/pocs/personal-color-report` 경로가 404였다. `next.config.ts`에 리다이렉트 2개를 추가했다. 처음에는 `/:path*` 하나로 처리했는데, 빈 경로에서 `Location`이 비어 있었다(Next 16.4.6에서 실측). 그래서 루트용 규칙을 따로 두었다. basePath는 선행 플로우의 절대 경로 `fetch('/api/...')`를 깨므로 쓰지 않았다.
2. 분석도구가 OpenAI 응답에서도 "Claude 비전 (gpt-6.2-sol)"으로 표시됐다. "AI 비전 (<모델>)"으로 바꿨다(`assemble.ts`).
3. AI가 ⑩ 그루밍 제안 앞에 "피부: "처럼 항목 이름을 붙여, 표에 항목 이름이 두 번 나왔다. 병합할 때 앞의 한글 항목 이름과 콜론을 떼도록 했다(`narrative.ts`).
4. 13 주의사항에 camera-face 경고가 "이번 촬영: 정면 — …"처럼 엠대시가 섞인 채로 나왔다. "이번 촬영(정면): …"으로 바꿨다.

테스트는 `report.test.ts`에 3건을 추가하고 `ai-path.test.ts`의 라벨 기대값을 고쳤다. `live-response.test.ts`는 기본적으로 건너뛰며, `CELEBER_PCR_LIVE_DIR`에 응답 JSON 폴더를 지정하면 실행된다. 앱 test 35 통과(1 건너뜀), typecheck와 lint는 오류 없이 통과했다.

## 제한·관찰

- 프로세스마다 첫 AI 호출이 Anthropic 400을 한 번 거친다. dev 서버가 `next.config.ts` 변경으로 재시작된 뒤에도 같은 일이 생겨 400이 두 번 기록됐다. 이 때문에 생성 시간이 늘지는 않았다(19~23초).
- 사진 기반 기본 스타일(`presentation`)은 AI 응답에 따라 달라진다. 같은 B 사진이 한 번은 male, 한 번은 unspecified로 나왔다. 사용자가 바꿀 수 있으므로 버그로 보지 않았다.
- `look-a.jpg` 원본은 발끝이 사진 가장자리에 닿아 camera-body가 '측정 불가'로 판정했다. 아래 여백을 늘리자 측정됐다. 데모 전신 사진으로 쓰려면 여백이 필요하다.
- dev 모드에서 Next 오버레이가 "2 Issues"를 띄운다. MediaPipe가 `console.error`로 찍는 "INFO: Created TensorFlow Lite XNNPACK delegate"가 원인이며 프로덕션과 무관하다(03-prep 스크린샷에 보인다).
- 데스크톱(1280px)에서도 모바일 1열 레이아웃이다. 카드의 3열 배치는 UI 목업(HOLD) 범위다.
- A의 입력은 카드 이미지를 잘라 낸 것이라 "업로드한 사진" 글자가 사진 안에 이미 들어 있다. 앱 버그가 아니다.
- 변형을 원래 성별로 되돌려도 `userSelected=true`로 남아 "직접 고른 스타일" 안내가 나온다. 동작에는 영향이 없어 그대로 두었다.

## 스크린샷 (`shots/`)

`personal-color-report-01-home`(/pocs 경로로 진입), `02-new`, `03-prep`, `04-report-a-top`, `05-report-a-full`, `06-report-a-drape`, `07-report-b-female-full`, `08-reports`, `09-report-a-desktop`
