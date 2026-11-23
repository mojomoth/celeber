# camera-body 라운드 2 수정 확인 (2026-11-24)

3102 dev(빈 스크래치 데이터), Playwright 430×932. 입력은 검증자 cb-r2와 같은 파일. 작업 후 서버 종료.

| 입력 | 수정 전 | 수정 후 |
|---|---|---|
| look-b 위 60px 제거 | complete 9.0 | failed head-cropped |
| look-a 위 70px 제거 | complete 8.7 | failed head-cropped |
| look-b 위 30px 제거 | complete 7.8 | complete 8.6 + head-near-edge 경고 |
| look-b 왼쪽 150px 제거 | complete, 어깨폭 '좁은 편' | failed body-cropped-side |
| 90° 회전 | 발·어깨 87° 안내 | photo-rotated 하나 |
| 밝기 0.6 | '밝은 곳에서' 안내 | 밝기 안내 없음(저조도일 때만) |
| 머리 없음 → 실패 기록 저장 | 눈금 1~10·체형 점수 | 사진과 사유만 |
| look-b / png / webp / 아래 여백 / look-b-2 / 2.5배 | 8.17 / 8.19 / 7.99 / 7.78 / 7.62 / 7.78 | 8.50 / 8.50 / 8.48 / 8.53 / 8.59 / 8.48 |
| look-a / 아래 여백 | 8.16 / 7.91 | 7.77 / 7.79 |

스크린샷: `r2fix-*.png`. 단위 테스트 픽스처: `pocs/camera-body/test/fixtures/*.pose.json`.
