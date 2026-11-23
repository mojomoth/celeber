# camera-body 라운드 3 수정 확인 (2026-11-24)

검증자 이슈 6건([critic/cb-r3](../critic/cb-r3/README.md))을 `pocs/camera-body`에서 고쳤다. 3102 dev(FORCE_MOCK 없음, 빈 스크래치 데이터), Playwright 1.64.1 헤드리스 430×932로 cb-r3와 같은 입력 파일을 다시 돌렸고, 작업 후 서버를 종료했다. `pnpm test` 89개, typecheck, lint 통과. 회귀 테스트는 `test/gate1-r3.test.tsx`.

| 이슈 | 수정 | 수정 전 → 수정 후 |
|---|---|---|
| major 선바이저 정수리 | 얼굴 추정 정수리가 헤어 윤곽보다 한참 아래면 `헤어 윤곽 + 머리 길이 × 0.1`로 올림(눈~턱×2×1.15 상한). 0.08 넘게 올렸으면 `head-top-uncertain` 경고 | look-b 8.50 → 7.65, 변형 8.4~8.6 → 7.4~7.7 |
| minor 한 사람에 '여러 사람' | 포즈 수 대신 `countExtraPeople`(키 25% 이상, 겹침 50% 미만). 잘림·회전·기울기 실패에는 경고 제외 | nohead200-b 포즈 2개 → 0명, 경고 없음. two-b는 1명 유지 |
| minor 흑백·저채도 실패 | 사람을 못 찾거나 발목 visibility < 0.5면 정사각형 여백 캔버스로 한 번 더 검출, 나은 쪽 사용 | gray-b no-person → 7.52, gray-b.png 7.43, desat-b feet-unclear → 7.64 |
| minor 31%인데 '범위보다 낮음' | 범위 판정과 해석을 표시 자릿수로 반올림한 값으로(`displayedValue`, `rangeVerdict`) | 0.307 '31%' → 범위 안 |
| minor 12° 기운 사진을 자세 탓 | 어깨·골반·몸통이 같은 방향으로 3° 이상이면 카메라 기울기. 15° 넘으면 `camera-tilted` 실패, 이하는 경고 하나 | rot12-b posture-extreme '어깨 높이를 맞춰' → camera-tilted '카메라를 수평으로' |
| minor 어깨 라벨 잘림 | 오른쪽 경계를 넘으면 선 왼쪽 바깥, 그래도 안 되면 선 안쪽(`placeWidthLabelX`) | two-b '어깨' 라벨이 선 왼쪽에 온전히 보임 |

## 함께 바뀐 판정

- 위 30·45px 제거본(topcut30-b, topcut45-b)과 look-a 위 40px 제거본은 complete 8.5·7.8 + head-near-edge → **failed head-cropped**. 머리 마스크 첫 행이 머리 폭 이상으로 잘려 있으면(1.2~1.3, 머리끝만 닿은 사진 0.06~0.35) 정수리가 사진 밖이다. 정수리를 헤어 윤곽 근처로 옮기면서, 머리카락이 잘린 사진을 측정하면 원본과 0.9등신 차이가 나서 실패로 돌렸다. 라운드 2 테스트를 이에 맞게 고쳤다.
- look-a 7.77 → 7.43, 아래 여백 사본 7.79 → 7.46(차이 0.03). 모자가 없어도 얼굴 추정 정수리가 헤어 윤곽보다 25px 아래였다. 경고는 붙지 않는다.
- 어두운 사본 dark0.2·0.3·0.45는 failed(no-person·feet-unclear) → complete 7.52~7.60 + low-light. 여백 재검출에서 발목이 잡혔다. 값은 원본과 0.15 안쪽이다.
- 정수리 불확실 경고는 값이 있는 완료 결과에만 붙인다.

## 브라우저 결과 (수정 후)

| 입력 | 결과 |
|---|---|
| look-b / png / webp / 아래 여백 / 2.5배 / 200px / 반전 / look-b-2 / 큰 파일 2종 | 7.65 / 7.64 / 7.60 / 7.44 / 7.63 / 7.59 / 7.66 / 7.61 / 7.58·7.59, 모두 head-top-uncertain |
| look-a / 아래 여백 / 흑백 / 어둡게(여백) | 7.43 / 7.52 / 7.54 / 7.50, 정수리 경고 없음 |
| 위 30·45·60px, look-a 위 40·70px, 200·330px, 몸통만 | failed head-cropped ('여러 사람' 없음) |
| 좌우 잘림 3종 / 발 잘림 2종 / 90°·180° | body-cropped-side / feet-cropped / photo-rotated |
| 단색·노이즈 | no-person |
| 두 사람 | 7.71 + 여러 사람 |

저장 흐름: look-b, rot12-b 모두 `POST /api/body/analyze` 200, 상세 화면 정상. 개발 오버레이의 "1 Issue"는 MediaPipe가 console.error로 찍는 `INFO: Created TensorFlow Lite XNNPACK delegate` 로그다(기존과 같음).

스크린샷: `r3fix-*.png`. 새 픽스처(nohead200-b, rot12-b, gray-b, desat-b, two-b, topcut45-b)는 수정 후 파이프라인에서 브라우저로 잰 값이고, 포즈가 2개면 `poses`·`mainIdx`를 함께 담았다. 측정 때는 `analyzeBodyImage`에 임시 덤프 코드를 넣었다가 뺐다.
