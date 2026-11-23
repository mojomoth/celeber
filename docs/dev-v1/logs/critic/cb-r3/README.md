# Gate 1 camera-body 독립 검증 (라운드 3, 2026-11-24)

- 실행: 3102 dev 새로 띄움(FORCE_MOCK 없음, 빈 스크래치 CELEBER_DATA_DIR), Playwright 1.64.1 헤드리스 430×932, 작업 후 종료. test 71/71, typecheck·lint 0.
- 판정: FAIL (major 1)

| 입력 | 결과 | 비고 |
|---|---|---|
| look-b.jpg (선바이저) | complete 8.5등신, 다리 0.518, 상:하 0.93 | **정수리 선이 선바이저 로고를 지남(y=48px, 머리카락 끝 9px, 띠 위 경계 30px)**. 라운드 1은 8.17 |
| look-b 변형(png·webp·여백·2.5배·축소·반전·look-b-2·13/17/24MB) | 8.4~8.6 | 편차는 해결, 치우침은 남음 |
| look-a / 아래 여백 / 위 40px 제거 | 7.8 / 7.8 / 7.8 + head-near-edge | 정수리·턱 위치 맞음 |
| 위 30·45px 제거 | complete 8.5 + head-near-edge | |
| 위 60·70px, 200·330px 제거 | failed head-cropped | 200px 제거본에 '여러 사람' 경고가 잘못 붙음 |
| 왼·오른쪽 150px, 왼쪽 90px 제거 | failed body-cropped-side | 해결 |
| 발 잘림(아래 40·150px) | failed feet-cropped | |
| 90°·180° 회전 | failed photo-rotated | 해결 |
| 12° 회전 | failed posture-extreme, '어깨 17° … 어깨 높이를 맞춰' | 사진 기울기를 자세 탓으로 안내 |
| 밝기 0.6 / 0.45·0.3 / 0.2 | complete 8.2 / failed feet-unclear + low-light / '사진이 어두워 사람을…' | |
| look-a 밝기 0.3(여백) | complete 7.8 + low-light | |
| look-b 흑백 / 채도 0.15 | failed no-person / failed feet-unclear | 좌우 300px 여백을 붙인 흑백본은 complete 8.3 |
| 두 사람 | complete 8.6 + 여러 사람 경고 | '어깨' 라벨이 오른쪽 경계에서 잘림 |
| 사람 없음(단색·노이즈), 몸통만 | failed no-person | |
| fake.jpg·doc.pdf·GIF / .heic | 'JPEG, PNG, WebP 사진만…' / 'HEIC 사진은…JPEG로 변환' | |
| 27MB·38MB | 업로드 전 '25MB 이하로', API 413 한국어 | |
| 저장 | POST /api/body/analyze 200, outfit ai·gpt-6.2-sol (Anthropic 400 한도 → OpenAI) | 실패 기록 화면은 사진·사유만 |

스크린샷: 이 폴더 `r3-*.png`. Codex 2차 의견: `codex-second-opinion.txt`.
