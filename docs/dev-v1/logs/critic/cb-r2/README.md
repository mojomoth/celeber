# Gate 1 camera-body 독립 검증 (라운드 2, 2026-11-24)

- 실행: 3102 dev 새로 띄움(FORCE_MOCK 없음, 빈 스크래치 CELEBER_DATA_DIR), Playwright 1.64.1 헤드리스 430×932, 작업 후 종료.
- 판정: FAIL (major 2)

| 입력 | 결과 | 비고 |
|---|---|---|
| look-b.jpg | complete 8.17등신, 다리 0.515, 상:하 0.94 | 저장 200, outfit ai·gpt-6.2-sol |
| look-a.jpg | complete 8.16등신 + feet-near-edge 경고 | 라운드 1 오안내 해결 |
| look-b 아래 80px 여백 / look-b-2 / webp / 2.5배 확대 | 7.78 / 7.62 / 7.99 / 7.78등신 | 같은 인물·사진인데 ±0.3, 같은 파일은 3회 모두 같음 |
| 머리 없음(위 330·200px 제거) | failed head-cropped | 해결. 다만 '어깨나 골반이 크게 기울어' 오진 동반 |
| **정수리 일부 잘림**(look-b 위 60px, look-a 위 70px) | **complete 9.0 / 8.7등신, 경고 없음** | major |
| **몸 왼쪽 절반 잘림**(look-b 왼쪽 150px 제거) | **complete 7.8등신, 어깨폭/키 18% '좁은 편', 경고 없음** | major |
| 발목·발끝 잘림 | failed feet-cropped | 정상 |
| 밝기 0.8·0.9 / 0.6·0.45·0.38·0.3 / 0.2 | complete / failed feet-uncertain / '사진이 어두워 사람을…' | 오측정 대신 실패. 0.6은 low-light 경고 없이 '밝은 곳에서' 안내 |
| look-a 밝기 0.3·0.45 | complete 8.16·7.55 + low-light 경고 | |
| 사람 없음 2종, 노이즈 5.6MB | failed no-person | 정상 |
| 11MB·18MB 유효 JPEG | 업로드 200, complete | 라운드 1 해결 |
| 27MB | 업로드 전 '25MB 이하로' 안내 / API 413 한국어 | 정상 |
| fake.jpg / doc.pdf | 'JPEG, PNG, WebP 사진만 올릴 수 있습니다.' | 해결 |
| 90° 회전 | failed, '밝은 곳에서 발이 또렷하게' + '어깨 87°' | 안내 부정확 |
| 두 사람 | complete + '여러 사람' 경고 | 정상 |

스크린샷: 이 폴더 `r2-*.png`. Codex 2차 의견: `codex-second-opinion.txt`.
