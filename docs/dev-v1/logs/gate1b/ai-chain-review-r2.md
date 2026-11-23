# AI 공급자 체인 독립 재검증 r2 (2026-11-24)

대상: pocs/core/src/server/ai.ts, env.ts. 판정: **PASS** (major 0, minor 9)

근거
- core: 145 pass / 1 skip, typecheck·lint 0 오류
- 실제 OpenAI 1회(CELEBER_AI_PROVIDER=openai, ai-live.test.ts): source ai, zod 통과, 5.25s
- 프로브 결과: [ai-chain-r2-probe-results.txt](ai-chain-r2-probe-results.txt). 프로브 코드: ai-chain-r2-probe / -realfetch / -codex-repro .test.ts
- Codex sol 2차 의견: [ai-chain-codex-r2b.txt](ai-chain-codex-r2b.txt)

r1 이슈 회귀
- major 마감: 해결. Anthropic 무응답·본문 정지 → 90초에 OpenAI로 넘어감. 둘 다 무응답이면 180초에 Mock. 실제 undici fetch와 로컬 무응답 서버로도 4가지 모두 90초에 끝나고 'API 응답 시간 초과'로 표시됨
- OpenAI 마지막 대기: 해결(500×2 = 1.5초)
- 시간 초과 표시: 해결. 200 뒤 본문 오류는 'API 연결 실패'
- 402, type만 insufficient_quota: 해결(차단, 1회 호출)
- 대소문자, 모르는 값 경고, 지정 공급자 키 없음 경고: 해결
- 로그 키 가림: 해결(가짜 sk-proj·sk-ant 키가 로그·경고·capabilities에 없음)
- 필드 이름 properties: 해결
- 동시 요청, 허브 라벨: 남음(minor)

남은 minor (직접 재현한 것만)
1. 동시 요청이 이미 막힌 공급자를 다시 호출함(시작 시 live 목록 고정). ai.ts:336,349
2. 허브 라벨이 'AI 분석 (Claude)'로 고정됨. hub/app/page.tsx:83 (소유 밖)
3. CELEBER_AI_PROVIDER 값 원문을 경고 로그에 그대로 남김. 키를 잘못 넣으면 서버 로그에 기록됨. env.ts:45
4. Anthropic 200 응답이 JSON이 아니면 V8 영문 파싱 오류가 화면 경고에 그대로 나옴(키는 앞 몇 글자만 나옴). ai.ts:422
5. OpenAI 오류 응답(503)의 본문이 멈추면 90초 뒤 '시간 초과'가 아니라 'API 오류 503'으로 표시됨. ai.ts:267-269
6. OpenAI 200 + status=failed를 'AI 응답이 JSON이 아닙니다'로 분류하고 재시도하지 않음. ai.ts:284-296
7. 루트가 배열·유니온인 스키마도 strict=true로 판정됨. 인라인 사용처에서는 이런 스키마를 찾지 못함. ai.ts:212
8. 차단이 키가 아니라 공급자 ID에 걸려 있어, 키를 바꿔도 10분 동안 차단이 유지됨. env.ts:97-103
9. (참고) fetch가 signal을 무시하면 OpenAI 호출이 끝나지 않음. 실제 undici에서는 재현되지 않아 채택하지 않음

Codex 의견 중 채택하지 않은 것: #1 sharp·Mock 무한 대기(재현할 수 없음), #6 Anthropic 429 지출 한도, #7 credit_balance_exhausted(문서상 주장이라 오프라인으로 확인할 수 없음), #3의 '키 노출'(V8이 앞 몇 글자만 인용함. 문구 문제로만 채택)
