# Gate 1: 실제 AI 공급자 연결

- 일시: 2026-11-24
- 키는 `set -a; source .env; set +a`로 셸 변수에만 올렸다. 아래에는 상태코드·모델명·응답 요지만 남긴다.

## 공급자 구성

`pocs/core/src/server/ai.ts`의 `callVisionStructured`가 공급자를 순서대로 시도한다.

| 순서 | 공급자 | 모델 변수 (기본값) | 비고 |
|---|---|---|---|
| 1 | Anthropic | `CELEBER_VISION_MODEL` (`claude-opus-5-5`) | 12/1까지 400 사용 한도 초과 → 첫 실패 후 10분간 건너뜀 |
| 2 | OpenAI Responses API | `CELEBER_OPENAI_MODEL` (`gpt-6.2-sol`) | `text.format: json_schema`, strict |
| 3 | Mock | | 모두 실패하거나 키가 없을 때 |

- `CELEBER_AI_PROVIDER=auto|anthropic|openai` (기본 auto). 차단은 공급자별로 따로 건다.
- 프롬프트·스키마는 그대로 쓴다. `IDENTITY_POLICY` + 작업 system → OpenAI `instructions`. zod → JSON Schema 변환은 Anthropic SDK의 `betaZodOutputFormat`을 재사용하고, 응답은 같은 zod 스키마로 다시 검증한다.
- effort(`low`~`max`)는 OpenAI `reasoning.effort`에 그대로 넘긴다. `gpt-6.2-sol`은 다섯 값 모두 200, `none`만 400.

## 실제 호출

### Anthropic 상태 확인

`POST /v1/messages` (`claude-opus-5-5`) → 400 `invalid_request_error`, "You will regain access on 2026-12-01 at 00:00 UTC". 그대로 둘 수 없어 대체 공급자를 붙였다.

### 데모 사진 비전 분석 (auto 순서)

- 명령: `CELEBER_LIVE_AI=1 pnpm --filter @celeber/core exec vitest run test/ai-live.test.ts` ([ai-live.test.ts](../../../pocs/core/test/ai-live.test.ts), 평소에는 건너뜀)
- 입력: `pocs/core/fixtures/demo-people/look-a.jpg`, 코디 서술 스키마(summary, items[category/name/colorName], accessories), effort low
- 흐름: Anthropic 400 사용 한도 → Anthropic 차단 → OpenAI 호출 성공
- 결과: `source: 'ai'`, `model: 'gpt-6.2-sol'`, 4.8초, 입력 1,359 / 출력 206 토큰, zod 검증 통과
- 호출 뒤 capabilities: `ai: true, aiProvider: 'openai', model: 'gpt-6.2-sol', aiBlockedReason: null`
- 응답 요지: "밝은 베이지 스웨트셔츠에 차콜 와이드 슬랙스를 매치한 코디입니다. 회색 토트백과 검은색 신발로 차분하게 마무리했습니다." items 4개(상의·하의·신발·가방), accessories 없음. 인물 신원 언급 없음.

### 앱 AI 스키마 호환성

`CELEBER_AI_PROVIDER=openai`로 텍스트 전용 호출(effort low)을 한 번씩 보냈다. 모두 strict 스키마로 통과했다.

| 스키마 | 앱 | 결과 |
|---|---|---|
| `OutfitAiSchema` | camera-body | ai, 3.4초 |
| `GuideAiSchema` | celeb-vibe-report | ai, 5.9초 |
| `AiNarrativeSchema` | personal-color-report | ai, 8.2초 |
| `VibeAiSchema` | celeb-vibe | ai, 8.8초 |

camera-face(`EnvAiSchema`, `FaceAiSchema`)와 search-celeb(`PhotoTextSchema`, `TitleNamesSchema`, `NameCandidatesSchema`, `JudgeSchema`)의 스키마는 모듈 밖으로 export되지 않아 따로 호출하지 않았다. 모두 필수 필드·enum·정수만 쓰는 얕은 객체라 strict 조건을 만족한다. 실제 응답은 PoC 입출력 검증에서 확인한다.

## 이미지 검색 대체 (GOOGLE_API_KEY)

| 시도 | 결과 |
|---|---|
| `gemini-3.5-flash` + `google_search` 도구 | 429 `RESOURCE_EXHAUSTED` (할당량 초과) |
| `gemini-2.5-flash`, `gemini-3.5-flash-lite`, `gemini-3-flash` | 404 |

판정: BLOCKED. 이 키로는 검색 그라운딩을 쓸 수 없다. 이미지 검색은 계속 Mock이다.

참고로 OpenAI Responses API의 `web_search` 도구(`gpt-6.2-sol`)를 한 번 시험했다. 이름으로 요청했을 때 실제로 열리는 이미지 URL 1개(200 `image/jpeg`)와 출처 페이지를 돌려줬다. 5개를 요청해 1개만 받았으므로 대체 공급자로 쓸지는 따로 정한다. 쓰더라도 이름 검색 결과로만 쓰고 사용자가 확정하는 흐름은 그대로 둔다.

## 테스트

- `pnpm --filter @celeber/core test`: 102개 통과 (새 [ai-provider.test.ts](../../../pocs/core/test/ai-provider.test.ts) 10개 포함, live 1개 건너뜀)
- `pnpm test`: 354개 통과, `pnpm typecheck`·`pnpm lint` 오류 없음
