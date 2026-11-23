# AI 공급자 체인 독립 재검증 (라운드 1)

- 일시: 2026-11-24. 대상: `pocs/core/src/server/ai.ts`, `env.ts`. 판정: **FAIL** (major 1, minor 7)
- 근거 파일: [프로브 결과](ai-chain-probe-results.txt), 프로브 [1](ai-chain-probe.test.ts)·[2](ai-chain-probe2.test.ts)·[3](ai-chain-probe3.test.ts), [실제 OpenAI 호출](ai-chain-live-openai.txt), Codex sol [1차 리뷰](ai-chain-codex-r1.txt)·[2차 의견](ai-chain-codex-r2.txt)
- 프로브는 fetch를 가짜로 바꿔 외부 호출 없이 돌린다. 실행: repo 루트에서 vitest `--config`(root=repo, `server-only`·`zod`·SDK zod helper alias)

## 통과

- 실제 호출 1회: `CELEBER_AI_PROVIDER=openai`, `gpt-6.2-sol`, 5.2초, `source: 'ai'`, zod 통과. 출력에 키 문자열 0건
- `CELEBER_AI_PROVIDER`: 없음·`auto`·빈 값·`gemini` → auto, `openai`·`anthropic`·`' openai '` → 그 공급자만
- 차단: Anthropic 400 사용 한도·401·403, OpenAI 401·403·429 `insufficient_quota` → 10분 차단. 429 rate limit·500·404 → 차단 없음
- 화면 경고·capabilities에는 키가 들어가지 않는다. 실제 OpenAI 401 응답은 키를 `sk-proj-****ABCD`로 가린다(가짜 키로 확인)
- 회귀: `pnpm test` 전체 통과(core 120), `pnpm typecheck` 오류 0

## 이슈

| # | 등급 | 내용 | 재현 |
|---|---|---|---|
| 1 | major | 체인 전체 마감 시간이 없다. Anthropic 무응답이면 SDK가 180초×3회(542초) 뒤에야 OpenAI로 넘어간다. 200 헤더 뒤 본문이 멈추면 SDK 타이머가 이미 풀려 무기한 대기하고 OpenAI·Mock으로 넘어가지 않는다 | 프로브2 `hang calls=3, 542초`, 프로브3 `1800초 뒤 settled=false, calls=anthropic` |
| 2 | minor | OpenAI 마지막 시도 뒤에도 1.5초를 기다린다 | 2회 시도 3003ms |
| 3 | minor | Anthropic 타임아웃이 'API 연결 실패'로 표시된다 (`APIConnectionError` 분기가 먼저) | 프로브2 warning |
| 4 | minor | 결제 오류 분류 누락: Anthropic 402 → 차단 안 함·'API 오류 402', OpenAI 429 `type=insufficient_quota`(code 다름) → 재시도·차단 안 함·'요청 한도 초과' | 프로브2 |
| 5 | minor | 차단 전 동시 요청은 모두 막힌 공급자를 친다 (5건 → Anthropic 5회). 차단 뒤에는 건너뜀, 기록 유실 없음 | 프로브1 |
| 6 | minor | 허브 라벨이 'AI 분석 (Claude)'로 고정돼 OpenAI 사용 중에도 Claude로 보인다. 모두 차단되면 첫 공급자 사유만 표시 | `pocs/hub/app/page.tsx:83`, `env.ts:124` |
| 7 | minor | `CELEBER_AI_PROVIDER`가 대소문자를 구분해 `OpenAI`는 조용히 auto가 된다. `openai` 지정+키 없음이면 Mock이고 표시는 '키 없음' | 프로브1 |
| 8 | minor | upstream 오류 원문을 서버 로그에 그대로 남긴다(OpenAI는 키를 가려 보냄). `isOpenAiStrictSchema`는 필드명 `properties`를 오판해 strict를 끈다(현재 앱 스키마 영향 없음) | 프로브1 |

채택하지 않은 Codex 지적: "일반 Error 메시지로 키가 UI에 노출" — 공급자 경로에서 그런 Error가 생기지 않아 재현 불가.
