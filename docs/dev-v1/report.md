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
- **독립 critic.** 6개 중 5개가 PASS다. camera-body는 선바이저 사진에서 정수리를 바이저 중간에 잡아 8.5등신으로 부풀리는 major가 있었다. 라운드 3에서 헤어 윤곽 기준으로 고쳐 7.4~7.7이 됐지만 아직 재검증 전이다. [cb-fix-r3](logs/cb-fix-r3/README.md)
- **core 공용 수정.** 업로드 오류, 피부 ROI 가중, 팔레트 색 이름 등 5건을 고쳤다. 재검증에서 5건 모두 해결됐지만 회귀 1건이 나왔다([미해결](#미해결)). 같은 얼굴의 ITA 차이는 29°에서 19°로 줄었고, 남은 차이는 입력 영상 자체의 차이로 본다. [gate1-core-fix](logs/gate1-core-fix.md), [재검증](logs/core-recheck/run-log.txt)
- **`/pocs/<앱>` 경로.** basePath는 `/api` 절대 경로와 허브 probe를 깨서 쓰지 않았다. 각 앱이 `/pocs/<앱>/<경로>`를 `/<경로>`로 307 리다이렉트한다.
- **빌드·키 노출.** typecheck·lint·test(518개)·build:all 통과. 저장소와 클라이언트 번들에서 키 값 0건. [gate1-close](logs/gate1-close.md)

## 결정

- **AI 공급자는 Anthropic → OpenAI → Mock 순서다.** Gemini는 느리고 불안정해서 OpenAI(`gpt-6.2-sol`)를 대체로 붙였다. 프롬프트·zod 스키마는 그대로 쓰고, 응답의 `model`에 실제 모델이 남는다. 차단은 공급자별로 10분이다. `CELEBER_AI_PROVIDER`로 하나만 고를 수 있다. 근거는 [gate1-ai](logs/gate1-ai.md).
- **업로드 오류 코드를 나눴다.** 예전에는 모두 400 `upload_failed`였다. 이제 형식이 다르면 400 `unsupported_type`, 디코딩 실패는 422 `unreadable`, 약 4000만 화소 초과는 422 `too_many_pixels`, 얼굴·환경 사진의 SVG는 422 `svg_not_allowed`다. 메시지는 모두 한국어이고 sharp 원문은 서버 로그에만 남긴다. [api-contract](../wiki/api-contract.md#공용)
- **git은 로컬 `main`만 만들었다.** 커밋은 둘이다. Gate 0 이전 코드 상태가 따로 남아 있지 않아, 첫 커밋 'PoC 기준선'에 Gate 1 코드 수정까지 들어갔다. 두 번째 커밋은 하네스와 검증 기록이다.
- **커밋에서 뺀 것.** 스크린샷(`docs/dev-v1/logs/**/*.png`, 약 245MB)은 로컬에만 둔다. 그래서 로그 문서의 스크린샷 링크는 로컬에서만 열린다. MediaPipe 원본(`pocs/ui/static/mediapipe/`, 86MB)은 `pnpm fetch:models`로 다시 받는다. `.claude/settings.local.json`, `.vercel/`, `.turbo/`도 뺐다. 데모 사진(`pocs/core/fixtures/demo-people`)은 Mock 이미지 검색이 쓰므로 넣었다. 공개 원격에 올리기 전에 다시 정해야 한다.

## 미해결

- **Anthropic API 차단(2026-12-01 00:00 UTC까지).** 사용 한도 초과로 400이 난다. 각 앱 프로세스의 첫 AI 호출은 이 400을 한 번 거친 뒤 OpenAI로 넘어가고, 그 전까지 health의 `aiProvider`·`model`은 Anthropic으로 보인다. 지연을 없애려면 `CELEBER_AI_PROVIDER=openai`를 쓴다.
- **연예인 사진 검색 경로 없음 (BLOCKED).** Google Custom Search는 이 키로 쓸 수 없고(OAuth 필요), Gemini 검색 그라운딩은 429다. `NAVER_*`, `SERPAPI_API_KEY`가 없어 이미지 검색과 역이미지 검색은 항상 Mock이다. OpenAI `web_search`는 시험 호출에서 실제로 열리는 이미지 URL 1개를 돌려줬다. 대체로 쓸지는 정해야 한다. 이 때문에 search-celeb의 동명이인 검색어 문제는 실제 사진으로 확인하지 못했다.
- **core 회귀.** ROI 누락 사유 문구가 바뀌면서 personal-color-report `assemble.ts:208`의 `/^일부 피부 영역/`이 더 이상 맞지 않는다. 볼 두 곳이 빠져도 리포트 ⑭ '피부 측정 품질'에 누락 안내가 나오지 않는다. 감점은 그대로 들어간다.
- **core 남은 결함.** JSON 업로드의 깨진 data URL(`%ZZ`)이 400이 아니라 500을 낸다. ROI 균등 가중은 1000px보다 작은 ROI에서 완전하지 않고, 정사각 ROI는 상한 6000px을 조금 넘는다(6006px).
- **camera-body 재검증 전.** 위 major 수정분을 새 critic이 아직 보지 않았다.
- **dev 서버(Turbopack) 새로고침 반복.** 새로 띄운 dev 서버를 헤드리스 브라우저로 열면 'HMR hash mismatch'로 새로고침이 계속된다(celeb-vibe-report, camera-face, celeb-vibe, personal-color-report). 원인은 확정하지 못했다. UI 검증은 `next build` + `next start`로 했다.
- **판정 독립성(minor).** personal-color-report의 'AI 독립 판정' 프롬프트에 규칙 판정 결과가 함께 들어가, 일치도 근거로 쓰기에는 독립성이 약하다. camera-face 서버는 클라이언트가 보낸 `yawDeg`·`quality.issues`를 다시 계산하지 않는다(브라우저 경로는 해당 없음).
- **smoke 항목 수 57(POC-RESULT는 58).** 모두 통과했다. 테스트 인물 '윤하람'이 DB 사본에 이미 있으면 정리 단계의 DELETE가 집계에서 빠진다. 스크립트는 고치지 않았다.
