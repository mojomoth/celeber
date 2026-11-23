# camera-body 재검증 이슈 수정 (cb-recheck-r1 → 수정, 2026-11-24)

[재검증](../cb-recheck-r1/README.md) 이슈 6건을 `pocs/camera-body`에서 고쳤다. 3102 dev(빈 스크래치 데이터), Playwright 헤드리스 430×932, 같은 입력 파일(cbv4/in). 작업 후 서버를 종료했다. `pnpm test` 101개, typecheck, lint 통과. 회귀 테스트는 `test/gate1-r4.test.ts`, 새 픽스처 18개(g-*, rot*/rotm*-b)는 수정 전 파이프라인으로 잰 값이다(측정 때 넣은 임시 덤프 코드는 뺐다).

| 이슈 | 수정 | 수정 전 → 수정 후 (브라우저) |
|---|---|---|
| major 앉은 정면 사진 | 허벅지/정강이 < 0.7(`THIGH_SHIN_MIN`)이면 `not-standing`. 서버 비율 범위(`RATIO_BOUNDS`)를 lib로 옮겨 클라이언트도 같은 범위로 실패 처리(`ratioOutOfBounds`), 서버는 같은 함수를 쓴다 | g-sit 6.6 complete·저장 200 → failed not-standing. g-sit2 '이 결과 사용' 후 400 → failed, '측정 실패 상태로 기록' 200. g-sit-rot10 6.7 → failed |
| major 폼폼·올림머리 정수리 | 헤어 윤곽 보정 상한 `HEAD_EYE_MAX` 1.15 → 1.05 (모자 없는 사진 0.95~1.0, 선바이저 1.07) | g-pompom2 6.43 → 6.95(저장 200), g-beanie 6.43 → 6.95, g-bun 6.60 → 7.13. 정수리 경고 유지, 등신 '범위 안' |
| minor 회전 비대칭 | 공통 기울기 = ((어깨+골반)/2 + 몸통)/2 (`cameraTiltDeg`). 셋이 같은 방향(각 1° 이상)이고 3° 이상이면 카메라 기울기, 10° 넘으면 `camera-tilted` | +12° 12.4°·−12° 11.1° 모두 실패, ±16°·g-nohat −16°(14.6°) 실패. rot5-b '어깨 8°… 맞춰' → '사진이 5° 정도 기울어', rotm5-b '몸통 6°' → '4° 기울어', rot8-b 8° 경고 |
| minor 팔/키 범위 | 참조 31~36% → 28~34% (2D 측정 기준) | 선 사진 19장 모두 '범위 안' |
| minor 표시·판정 반올림 | `formatRatio`가 `displayedValue`로 표시. 코디 제안의 7등신 기준도 표시 값으로 | 0.945 '0.94'·범위 안 → '0.95'·범위 안 |
| minor 밀착 비니·야구모자 경고 | 마스크 형태로는 구분 불가: 헤어끝~눈 거리/머리 길이가 야구모자 0.57 = 모자 없음 0.57, 밀착 비니 0.51(앉은 사진 0.54와 여유 없음). 경고 규칙은 추가하지 않고 촬영 안내에 '모자는 벗고' 추가 | g-beanie2 8.06, g-cap 7.98 그대로, 경고 없음 |

함께 바뀐 값: look-b 계열 7.6~7.7 → 7.77~7.87(라운드 3 이전 8.5로는 돌아가지 않음, 정수리 경고 유지), two-b 7.71 → 7.88. 모자 없음 g-nohat 7.72, look-a 7.43, 페도라 7.62는 그대로. 잘림·사람 없음 판정 변화 없음.

스크린샷: `f-g-sit2-review.png`, `f-g-pompom2-review.png`, `f-g-pompom2-saved.png`, `f-rotm12-b-review.png`.
