# AI 공급자 체인 리뷰 수정 r2 (2026-11-24)

대상: pocs/core/src/server/ai.ts, env.ts, test/ai-provider-limits.test.ts(신규 13건), test/ai-provider.test.ts(기대값 1건 갱신)

- major 마감: 공급자당 90초 signal(AI_PROVIDER_TIMEOUT_MS)을 SDK `parse(..., { signal })`와 OpenAI fetch에 넘기고, raceAbort로 본문 읽기까지 끊음. 체인 전체 240초(AI_CHAIN_DEADLINE_MS, maxDuration 300 미만), 남은 시간 5초 미만이면 Mock. Anthropic maxRetries 2→1.
- OpenAI 마지막 시도 뒤 대기 제거. 200 뒤 본문 읽기 실패 → 'API 연결 실패'(JSON 깨짐은 'AI 응답이 JSON이 아닙니다').
- 시간 초과 분류: APIConnectionTimeoutError·APIUserAbortError·TimeoutError를 연결 실패보다 먼저.
- 결제: Anthropic 402 → 차단 + 'API 크레딧 부족'. OpenAI type=insufficient_quota → 재시도 없음·차단·'API 사용 한도 초과'.
- env: CELEBER_AI_PROVIDER 소문자 정규화, 모르는 값·지정 공급자 키 없음은 console.warn 1회. aiBlockedReason/전부 차단 warning은 공급자별 합침(aiBlockedSummary).
- 로그의 sk-… 가림, isOpenAiStrictSchema는 properties 맵 값만 재귀.
- 보류: 동시 요청 in-flight 합치기(검증자 'PoC 허용'), hub/app/page.tsx 라벨(소유 밖).

재현: 신규 테스트 수정 전 13/13 실패 → 수정 후 통과.
검증: core test 145 pass/1 skip, typecheck·lint 0 오류. 실제(.env): Anthropic 400 사용 한도 → OpenAI gpt-6.2-sol source ai 4926ms.
