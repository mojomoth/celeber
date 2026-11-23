# Gate 1 camera-body 독립 검증 (라운드 1, 2026-11-24)

- 실행: 3102 dev 새로 띄움(FORCE_MOCK 없음, CELEBER_DATA_DIR은 스크래치 빈 폴더), Playwright 1.64.1 헤드리스 430×932, 작업 후 종료.
- 판정: FAIL (major 3)

| 입력 | 결과 | 비고 |
|---|---|---|
| look-b.jpg | complete 8.2등신, 다리 0.515, 상:하 0.94 | 저장 200, outfit ai·gpt-6.2-sol(Anthropic 400 → OpenAI), 데모 배지 0 |
| look-a.jpg | failed feet-cropped | 발 전체가 보이는데 "발이 잘려" 안내 |
| look-a 위20·아래80px 여백 | complete 7.6등신, 다리 0.529 | |
| big-b.jpg 2350×7950 | complete 8.0등신 | |
| look-b.png | complete 8.2등신 | |
| 사람 없음 2종 | failed no-person | 문구 정상 |
| 밝기 0.12/0.2 | failed no-person | 어두움 안내 없음 |
| 밝기 0.3/0.45 | **complete 7.1등신**, 다리 0.486, 허벅지/정강이 1.36 | 발바닥선이 정강이 중간, 경고 없음 (major) |
| 머리 없는 사진(목 아래) | **complete 10.5등신**, 저장 200 | 가짜 머리로 측정 (major) |
| 머리 윗부분만 잘림 | failed head-cropped | 정상 |
| fake.jpg / doc.pdf | 400 한국어 | "(HEIC는 JPEG로 변환…)" 오안내 |
| 13.8MB 유효 JPEG, 35MB | **400 "Failed to parse body as FormData."** | 10MB 초과 전부 실패, 영문 (major) |

스크린샷: 이 폴더 `*-review.png`, `*-result.png`, `home.png`, `sessions.png`. Codex 2차 의견: `codex-second-opinion.txt`.
