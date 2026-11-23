# Gate 1 camera-body 수정 라운드 1 (2026-11-24)

검증자 이슈 7건([critic/cb](critic/cb/README.md))을 `pocs/camera-body`에서 고쳤다. 3102 dev 서버(빈 스크래치 `CELEBER_DATA_DIR`)와 Playwright 1.64.1 헤드리스(430×932)로 확인했고, 작업 후 서버를 종료했다.

## 결과

| 입력 | 수정 전 | 수정 후 |
|---|---|---|
| look-b.jpg | complete 8.2등신 | 같음 |
| look-a.jpg (밑창이 하단 경계에 붙음) | failed `feet-cropped` | complete 8.2등신 + `feet-near-edge` 경고 |
| nohead-b.jpg (look-b 위 330px 제거) | complete 10.5~14.8등신, 저장됨 | failed `head-cropped` |
| dark0.45 / dark0.3 | complete 7.1등신(검증자 실행), 경고 없음 | failed `feet-unclear` + `low-light` 경고 |
| dark0.2 / dark0.12 | "사람을 찾지 못했습니다" | "사진이 어두워 사람을 찾지 못했습니다…" |
| 18.9MB 유효 JPEG | 400 영문 `Failed to parse body as FormData.` | 200, complete 8.2등신 |
| 31MB / 40MB | 400 영문 | 413 한국어, 화면에서는 올리기 전에 "25MB 이하로" 안내 |
| fake.jpg / doc.pdf | "…HEIC/AVIF/GIF/SVG). (HEIC는 JPEG로…)" | "JPEG, PNG, WebP 사진만 올릴 수 있습니다." |

같은 사진도 실행마다 MediaPipe 출력이 조금 달라, 어두운 사진은 이번 실행에서 발목 visibility가 0.5 아래로 나왔다. 검증자 실행처럼 발 점이 정강이에 찍히고 visibility가 통과하는 경우는 마스크 교차 확인과 허벅지/정강이 비(>1.3)로 `feet-uncertain` 실패가 된다. 이 경우는 합성 관절점 테스트로 확인했다.

## 바꾼 규칙 (`src/lib/analyze.ts`)

- 얼굴을 못 찾았을 때 가짜 머리 판정: 눈~어깨 < 몸통 × 0.3, 마스크 머리 영역이 맨 위 행에 닿음, 마스크가 추정 정수리보다 머리 하나 넘게 위로 이어짐 → `head-cropped`.
- 발목이 프레임 안에 있고 visibility만 낮으면 `feet-unclear`(잘림 문구를 쓰지 않음).
- 마스크 발끝이 발 점보다 키의 5% 넘게 아래거나 허벅지/정강이 > 1.3 → `feet-uncertain`. 5% 안이면 마스크 발끝을 발바닥으로 쓴다(두꺼운 밑창).
- `mask-at-edge` 잘림은 발 점이 하단 2.5% 안일 때만. 그 밖은 `feet-near-edge` 경고.
- 등신 3.5~10 밖, 어깨 폭/키 < 0.1, 어깨·골반 기울기 > 15° → 실패. 서버 `RATIO_BOUNDS`도 등신 3.5~10, 어깨 폭/키 0.1~0.6.
- 평균 휘도 < 0.35면 `low-light` 경고, 사람을 못 찾으면 어둡다고 안내.

그 밖: `next.config.ts` `proxyClientMaxBodySize: '36mb'`, 업로드 사전 검사·오류 문구(`src/flow/uploadMessages.ts`), 분석 중 안내 "비율은 기기에서 잽니다. 저장할 때 코디 서술을 위해 사진을 AI 서비스로 보냅니다.", 골반 라벨이 상·하체 칩과 겹치면 칩 위로 비켜 놓음(`BodyOverlay.tsx`).

## 검증

- `pnpm test` 58개 통과(40 → 58). 새 테스트 `test/gate1-fixes.test.ts`는 실측 포즈·마스크 fixture 4개(`test/fixtures/*.pose.json`)로 look-a, look-b, nohead-b, dark0.3을 재현한다.
- `pnpm typecheck`, `pnpm lint` 오류 0. 이 앱을 import하는 personal-color-report test 35개 통과, typecheck 오류 0.
- 스크린샷: [shots/cb-fix1](shots/cb-fix1/)

## 남은 것 (이 앱 밖)

- personal-color-report, camera-face, celeb-vibe, celeb-vibe-report, hub의 `next.config.ts`에는 `proxyClientMaxBodySize`가 없다. `proxy.ts`가 같은 매처를 쓰면 10MB 넘는 업로드가 같은 영문 400으로 실패한다(search-celeb은 이미 36mb).
- core `uploads.ts`의 FormData 파싱 실패 문구는 여전히 영문 원문이다. 이 앱 화면은 바꿔서 보여 준다.
- celeb-vibe `build.ts`, celeb-vibe-report `gaps.ts`가 "camera-body RATIO_BOUNDS와 같은 값"으로 등신 3~13을 복사해 두었다. 이번에 3.5~10으로 바꿨으므로 맞춰야 한다.
