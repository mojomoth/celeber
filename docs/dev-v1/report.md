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

## 결정

- **AI 공급자는 Anthropic → OpenAI → Mock 순서다.** Gemini는 느리고 불안정해서 OpenAI(`gpt-6.2-sol`)를 대체로 붙였다. 프롬프트·zod 스키마는 그대로 쓰고, 응답의 `model`에 실제 모델이 남는다. 차단은 공급자별로 10분이다. `CELEBER_AI_PROVIDER`로 하나만 고를 수 있다. 근거는 [gate1-ai](logs/gate1-ai.md).
- **AI 호출 마감은 공급자당 90초, 체인 전체 240초다.** 넘으면 다음 공급자나 Mock으로 넘어간다. 결제·한도 오류는 재시도 없이 차단한다. 동시 요청 합치기는 PoC 단계에서 하지 않는다. [ai-chain-fix-r2](logs/gate1b/ai-chain-fix-r2.md)
- **얼굴·환경 사진은 잘린 JPEG를 거절한다**(`failOn:'truncated'`). 다른 kind는 기존처럼 관대하게 디코드한다. data URL은 선언 MIME 대신 매직 바이트로 판별한다. [core-dataurl-r2](logs/gate1b/core-dataurl-r2.md)
- **Gate 1 판정 규칙.** 모든 PoC와 core·AI 공급자 체인이 PASS(minor만 남음)이면 자동 검증 PASS로 보고, 게이트 통과는 HIL 판정 뒤에 한다.
- **업로드 오류 코드를 나눴다.** 예전에는 모두 400 `upload_failed`였다. 이제 형식이 다르면 400 `unsupported_type`, 디코딩 실패는 422 `unreadable`, 약 4000만 화소 초과는 422 `too_many_pixels`, 얼굴·환경 사진의 SVG는 422 `svg_not_allowed`다. 메시지는 모두 한국어이고 sharp 원문은 서버 로그에만 남긴다. [api-contract](../wiki/api-contract.md#공용)
- **git은 로컬 `main`만 만들었다.** 커밋은 셋이다(세 번째는 Gate 1 잔여 수정과 재검증). Gate 0 이전 코드 상태가 따로 남아 있지 않아, 첫 커밋 'PoC 기준선'에 Gate 1 코드 수정까지 들어갔다. 두 번째 커밋은 하네스와 검증 기록이다.
- **커밋에서 뺀 것.** 스크린샷(`docs/dev-v1/logs/**/*.png`, 약 245MB)은 로컬에만 둔다. 그래서 로그 문서의 스크린샷 링크는 로컬에서만 열린다. MediaPipe 원본(`pocs/ui/static/mediapipe/`, 86MB)은 `pnpm fetch:models`로 다시 받는다. `.claude/settings.local.json`, `.vercel/`, `.turbo/`도 뺐다. 데모 사진(`pocs/core/fixtures/demo-people`)은 Mock 이미지 검색이 쓰므로 넣었다. origin(`mojomoth/celeber`)은 공개 저장소이고 이미 푸시됐다. 데모 사진과 레퍼런스 이미지의 공개 여부는 사용자 결정으로 남긴다.

## 미해결

- **Anthropic API 차단(2026-12-01 00:00 UTC까지).** 사용 한도 초과로 400이 난다. 각 앱 프로세스의 첫 AI 호출은 이 400을 한 번 거친 뒤 OpenAI로 넘어가고, 그 전까지 health의 `aiProvider`·`model`은 Anthropic으로 보인다. 지연을 없애려면 `CELEBER_AI_PROVIDER=openai`를 쓴다.
- **연예인 사진 검색 경로 없음 (BLOCKED).** Google Custom Search는 이 키로 쓸 수 없고(OAuth 필요), Gemini 검색 그라운딩은 429다. `NAVER_*`, `SERPAPI_API_KEY`가 없어 이미지 검색과 역이미지 검색은 항상 Mock이다. OpenAI `web_search`는 시험 호출에서 실제로 열리는 이미지 URL 1개를 돌려줬다. 대체로 쓸지는 정해야 한다. 이 때문에 search-celeb의 동명이인 검색어 문제는 실제 사진으로 확인하지 못했다.
- **dev 서버(Turbopack) 새로고침 반복.** 'HMR hash mismatch'로 새로고침이 계속되던 문제가 celeb-vibe-report 재검증에서는 재현되지 않았다. 코드는 바뀌지 않았고 원인은 확정하지 못했다.
- **camera-face 서버 검증(minor).** 서버가 클라이언트 랜드마크와 업로드 사진의 일치를 확인하지 않아, 조작한 API 호출로 다른 사진의 옆선이 저장될 수 있다(브라우저 경로는 해당 없음).
- **남은 업로드 경계(minor).** 끝에 EOI를 붙인 잘린 JPEG, 아주 가늘거나 선언 크기가 아주 큰 SVG는 업로드 200 뒤 분석 단계에서 실패한다. [core-dataurl-r2-verify](logs/gate1b/core-dataurl-r2-verify.md)
- **smoke 항목 수 57(POC-RESULT는 58).** 모두 통과했다. 테스트 인물 '윤하람'이 DB 사본에 이미 있으면 정리 단계의 DELETE가 집계에서 빠진다. 스크립트는 고치지 않았다.
