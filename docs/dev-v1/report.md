# 기술 검증 보고 (report)

기술 검증 결과, 중요한 결정, 미해결 문제만 적는다. 단계와 상태는 [run.md](run.md)에 있다.

## 기술 검증 결과

### CLI

2026-11-24 실측. 명령과 원문은 [gate0-probe](logs/gate0-probe.md#cli)에 있다.

- Codex CLI 0.171.0: `gpt-6.2-astra`(기본), `gpt-6.2-sol` 정상. 다른 모델은 ChatGPT 계정 로그인이라 쓸 수 없다.
- Codex 이미지 생성: 내장 `image_gen` 도구 정상.
- Claude CLI: `claude-sonnet-5-5`, `claude-opus-5-5` 정상, 이미지 분석도 된다. 로그인 구독으로 돌아서 `CLAUDE_API_KEY` 한도와 무관하다.

### API

키 값은 셸 변수로만 썼고 상태코드와 모델명만 남겼다. 상세는 [gate0-probe](logs/gate0-probe.md#api-키)에 있다.

| 키 | 결과 |
|---|---|
| OPENAI_API_KEY | 비전(`gpt-6.2-sol`, `gpt-6.2-astra`)과 이미지 생성(`gpt-image-2`) 모두 200 |
| CLAUDE_API_KEY | 키는 유효하지만 메시지 호출이 400. [미해결](#미해결) 참고 |
| GOOGLE_API_KEY | Gemini 비전은 응답까지 94초, 다른 모델은 503·429·404. Custom Search는 401 |
| JEV_KEY | Typesafe Jev 분류 API 200 |
| VERCEL_API_KEY, RENDER_API_KEY | 200 |

dev 서버, typecheck, lint, test, smoke 결과는 [gate0-devserver](logs/gate0-devserver.md)에 있다.

### Gate 1 PoC 검증

- **실제 AI 응답.** 6개 PoC 모두 OpenAI `gpt-6.2-sol` 응답으로 끝까지 진행했고, 응답이 zod 계약을 통과했다. 비전 호출은 4~9초, 리포트·가이드 생성은 19~23초 걸렸다. 이름 검색 AI는 없는 이름에 인물을 지어내지 않았다. 근거는 [gate1-ai](logs/gate1-ai.md)와 각 PoC 로그.
- **독립 critic과 재검증.** 6개 PoC 모두 재검증 PASS(major 0)다. camera-body의 선바이저 정수리 major는 헤어 윤곽 기준으로 고쳐 재검증을 통과했다. 남은 minor는 [run.md PoC별 결과](run.md#poc별-결과)에 있다.
- **core 공용 수정.** 업로드 오류, 피부 ROI 가중, 팔레트 색 이름 등 5건을 고쳤고, 뒤이어 나온 ROI 문구 회귀와 data URL 500도 고쳐 재검증 PASS(major 0)다. 같은 얼굴의 ITA 차이는 29°에서 19°로 줄었고, 남은 차이는 입력 영상 자체의 차이로 본다. [gate1-core-fix](logs/gate1-core-fix.md), [core-dataurl-r2-verify](logs/gate1b/core-dataurl-r2-verify.md)
- **AI 공급자 체인.** Codex sol 독립 리뷰 2라운드로 공급자별 마감, 결제·한도 오류 분류, 로그 키 가림을 고쳤다. r2 재검증 PASS(major 0). [ai-chain-review-r2](logs/gate1b/ai-chain-review-r2.md)
- **`/pocs/<앱>` 경로.** basePath는 `/api` 절대 경로와 허브 probe를 깨서 쓰지 않았다. 각 앱이 `/pocs/<앱>/<경로>`를 `/<경로>`로 307 리다이렉트한다.
- **빌드·키 노출.** typecheck·lint·test(594개)·build:all 통과. 저장소, `.next` 산출물, docs·로그에서 키 값 0건. [gate1b/close](logs/gate1b/close.md)

### Gate 2 통합

- `apps/web`의 프로덕션 빌드로 통합 동작을 검증했다. 기존 v4 목업도 별도로 빌드했고 390×844 및 1440×900에서 96개 동작을 재검증했다. [통합 흐름](../wiki/integration-flow.md)
- 통합 Chrome 검사 24/24 PASS, 콘솔 오류 0건. 모바일에서 생성 사진을 업로드했고 데스크톱에서는 테스트 영상을 카메라 입력으로 공급해 셔터를 눌렀다. 두 환경에서 분석 불가 사진에서 동일 인물의 실사진으로 전환했고, 개인 맞춤 가이드와 리포트를 저장·재열기한 뒤 초기화를 검증했다. 가로 4px 넘침은 검색 시트와 공유 푸터의 여백을 맞춰 수정했다. [통합 실행 로그](logs/gate2-browser/flow.log)
- 통합 웹과 PoC 8개 빌드, 타입 검사, 린트, 테스트 602개가 통과했다. Git 대상과 통합 `.next`의 키 값 일치는 0건이다.
- OpenAI 실제 이미지 결과를 기존 다운로드·형식 검증 경로로 받는다. 아이유의 평소 사진 9장 중 7장을 분석 가능으로 판정했으며 1000×1459 JPEG가 앱을 통해 열렸다. 제니의 이름 검색 결과에서 실제 썸네일과 출처 링크를 확인했다. [OpenAI 이미지 검색](https://developers.openai.com/api/docs/guides/tools-web-search?api-mode=responses#image-search-results), [제니 사진 출처](https://news.nate.com/view/20260211n21739)
- 독립 검토에서 발견한 첫 접속 리디렉션, 로그인 쿠키, 이미지 캐시, 헬스체크 문제를 수정했다. 코드 입력과 만료 검사, 사진과 초기화 API 접근 제한, 교차 사이트 초기화 거부를 실제 응답으로 확인했다. 같은 SQLite와 업로드 디렉터리를 사용하는 새 프로세스로 재시작한 뒤 사진 바이트와 메타데이터가 유지됐다.
- Codex CLI `gpt-6.2-sol`로 추구미 화면을 구현하고 `gpt-6.2-astra`로 운영 경로를 검토했다. Claude CLI `claude-sonnet-5-5`와 `claude-opus-5-5`는 기존 로그인 갱신에 실패했고 API 키 호출은 사용 한도에 걸렸다.

랜딩 파일은 Codex의 내장 `image_gen`으로 생성했다. [landing-editorial.webp](../../apps/web/public/photos/landing-editorial.webp)

<details>
<summary>랜딩 이미지 생성 프롬프트</summary>

> Use case: photorealistic-natural. Generate a new original premium Korean beauty editorial photograph for the full-bleed portrait phone landing of a personal color analysis app, narrow vertical 9:19.5 mobile framing if possible. A fictional adult Korean woman, dark bob with a few soft stray hairs, single subject, relaxed and composed, subtle turn toward camera and a direct gaze, authentic natural skin texture and barely-there makeup. Close-up head and shoulders, framed across the middle between 25% and 70% of frame height; forehead and hair begin below the top 21%, and reserve the top 20% as empty dim deep indigo studio atmosphere for a separate white logo. Broad matte fabric drapes around her shoulders and organically overlap below, using restrained muted sage left, soft hydrangea lavender mid, slate blue low, muted rose lower right, an editorial demonstration of personal color. Deep ink-indigo with soft teal at left and deep plum at right, restrained fine grain, faded softly colored edges of studio lighting, readable warm-ivory skin, sophisticated quiet elegance. In the lowest 15% the textiles fall into a very dark plum shadow for a separate white button. No text, no symbols, no logo, no borders, no interface, no phone. Final intended as a compressed WebP background image.

</details>

## 결정

- **AI 공급자는 Anthropic → OpenAI → Mock 순서다.** Gemini는 느리고 불안정해서 OpenAI(`gpt-6.2-sol`)를 대체로 붙였다. 프롬프트·zod 스키마는 그대로 쓰고, 응답의 `model`에 실제 모델이 남는다. 차단은 공급자별로 10분이다. `CELEBER_AI_PROVIDER`로 하나만 고를 수 있다. 근거는 [gate1-ai](logs/gate1-ai.md).
- **AI 호출 마감은 공급자당 90초, 체인 전체 240초다.** 넘으면 다음 공급자나 Mock으로 넘어간다. 결제·한도 오류는 재시도 없이 차단한다. 동시 요청 합치기는 PoC 단계에서 하지 않는다. [ai-chain-fix-r2](logs/gate1b/ai-chain-fix-r2.md)
- **얼굴·환경 사진은 잘린 JPEG를 거절한다**(`failOn:'truncated'`). 다른 kind는 기존처럼 관대하게 디코드한다. data URL은 선언 MIME 대신 매직 바이트로 판별한다. [core-dataurl-r2](logs/gate1b/core-dataurl-r2.md)
- **Gate 1 판정 규칙.** 모든 PoC와 core·AI 공급자 체인이 PASS(minor만 남음)이면 자동 검증 PASS로 보고, 게이트 통과는 HIL 판정 뒤에 한다.
- **업로드 오류 코드를 나눴다.** 예전에는 모두 400 `upload_failed`였다. 이제 형식이 다르면 400 `unsupported_type`, 디코딩 실패는 422 `unreadable`, 약 4000만 화소 초과는 422 `too_many_pixels`, 얼굴·환경 사진의 SVG는 422 `svg_not_allowed`다. 메시지는 모두 한국어이고 sharp 원문은 서버 로그에만 남긴다. [api-contract](../wiki/api-contract.md#공용)
- **git은 로컬 `main`만 만들었다.** 커밋은 셋이다(세 번째는 Gate 1 잔여 수정과 재검증). Gate 0 이전 코드 상태가 따로 남아 있지 않아, 첫 커밋 'PoC 기준선'에 Gate 1 코드 수정까지 들어갔다. 두 번째 커밋은 하네스와 검증 기록이다.
- **커밋에서 뺀 것.** 스크린샷(`docs/dev-v1/logs/**/*.png`, 약 245MB)은 로컬에만 둔다. 그래서 로그 문서의 스크린샷 링크는 로컬에서만 열린다. MediaPipe 원본(`pocs/ui/static/mediapipe/`, 86MB)은 `pnpm fetch:models`로 다시 받는다. `.claude/settings.local.json`, `.vercel/`, `.turbo/`도 뺐다. 데모 사진(`pocs/core/fixtures/demo-people`)은 Mock 이미지 검색이 쓰므로 넣었다. origin(`mojomoth/celeber`)은 공개 저장소이고 이미 푸시됐다. 데모 사진과 레퍼런스 이미지의 공개 여부는 아래 '공개 범위' 결정을 따른다.
- **HIL PASS(2026-11-24).** 사용자가 직접 "HIL은 통과하고 UI랑 계속 진행해"라고 지시했다. 이 지시로 Gate 1의 HIL을 PASS로 올리고 UI 목업을 진행했다.
- **UI 목업은 `pocs/ui/mockup`의 별도 Next.js 앱이다**(`@celeber/ui-mockup`, 포트 3107). PoC 6개가 공유하는 `@celeber/ui`를 깨지 않으려고 패키지를 나눴다. `@celeber/ui`는 eslint에서 `mockup/**`를 무시하고 test를 `src`로 한정했을 뿐 export는 그대로다. 화면은 `src/screens/<NN-name>/` 단위로 나누고 데이터는 props로 받아(목업 데이터는 `src/data/mock.ts`) Gate 2 통합 앱에서 그대로 쓸 수 있게 했다. 결과는 [gate1-ui](logs/gate1-ui.md).
- **연예인 이미지 검색 대체 공급자는 OpenAI `web_search`다(Gate 2에서 연결).** Google Custom Search(401)와 Gemini 그라운딩(429)은 쓸 수 없고 다른 검색 키는 없다. OpenAI 키는 이미 쓰고 있고 시험 호출에서 실제 이미지 URL을 받았다. 결과 품질은 Gate 2에서 실제 사진으로 확인하고, 실패하면 Mock으로 떨어진다.
- **공개 범위는 현행 유지다.** 사용자 응답이 없어 데모 사진·레퍼런스 이미지·목업 인물 사진(생성 이미지)을 공개 저장소에 그대로 둔다.
- **운영은 Render의 개인용 단일 인스턴스로 구성했다.** Vercel Functions의 지원 Node와 쓰기 가능한 파일시스템으로는 현행 SQLite와 업로드 파일을 유지하기 어렵다. Render에서는 `/var/data/celeber`를 영구 디스크에 둔다. 512MB 인스턴스와 1GB 디스크의 월 최소 비용은 미화 7.25달러다. [배포 설정](../../render.yaml), [Vercel Node 버전](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [Render 영구 디스크](https://render.com/docs/disks), [Render 가격](https://render.com/pricing)

## 미해결

- **Anthropic API 차단(2026-12-01 00:00 UTC까지).** 사용 한도 초과로 400이 난다. 각 앱 프로세스의 첫 AI 호출은 이 400을 한 번 거친 뒤 OpenAI로 넘어가고, 그 전까지 health의 `aiProvider`·`model`은 Anthropic으로 보인다. 지연을 없애려면 `CELEBER_AI_PROVIDER=openai`를 쓴다.
- **Google Lens 역이미지 검색은 설정 대기다.** 현재 통합 앱에서 이름 검색과 사진 업로드 및 분석을 쓸 수 있다. Lens 연동에 필요한 `SERPAPI_API_KEY`와 공개 이미지 주소는 제공되지 않았다.
- **dev 서버(Turbopack) 새로고침 반복.** 'HMR hash mismatch'로 새로고침이 계속되던 문제가 celeb-vibe-report 재검증에서는 재현되지 않았다. 코드는 바뀌지 않았고 원인은 확정하지 못했다.
- **camera-face 서버 검증(minor).** 468/478점의 개수와 윤곽 범위를 검사한다. 저장 사진에서 랜드마크를 다시 추출해 좌표와 대조하는 기능은 남아 있다.
- **남은 업로드 경계(minor).** 끝에 EOI를 붙인 잘린 JPEG, 아주 가늘거나 선언 크기가 아주 큰 SVG는 업로드 200 뒤 분석 단계에서 실패한다. [core-dataurl-r2-verify](logs/gate1b/core-dataurl-r2-verify.md)
- **smoke 항목 수 57(POC-RESULT는 58).** 모두 통과했다. 테스트 인물 '윤하람'이 DB 사본에 이미 있으면 정리 단계의 DELETE가 집계에서 빠진다. 스크립트는 고치지 않았다.
