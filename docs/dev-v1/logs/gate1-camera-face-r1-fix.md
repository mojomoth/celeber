# camera-face 수정 라운드 1 (2026-11-24)

검증 이슈 7건(`critic/camera-face-r1.md`)을 모두 고쳤다. 수정 파일은 `pocs/camera-face/**`뿐이다.

| 이슈 | 수정 | 확인 |
|---|---|---|
| major: 측면에 정면 사진 | `isProfileUsable`: \|yaw\| 35° 미만이거나 yaw error면 profile을 만들지 않고 `side:not-profile`(warn)를 남긴다. 확인 화면은 "그래도 사용"과 옆선 미분석 안내를 보여 주고, 미리보기 옆선도 그리지 않는다 | `test/critic-r1.test.ts` S. E2E: side 버튼 "그래도 사용", analyze `profile=null`, warnings `[warn:side:not-profile]` |
| 정면 error인데 사용하기 | `reviewAction`: error가 있으면 "그래도 사용"과 안내. 결과 상단에 "신뢰도가 낮은 결과" 표시(`lowConfidenceReasons`). 피부 신뢰도는 error 1건마다 ×0.7 | 테스트 D/E/F. face-cut+pitch는 0.5 미만. E2E dark.jpg: "그래도 사용", conf 0.64, 상단 표시 |
| 없는 측면 uploadId | 404 `upload_not_found`, 못 읽으면 422 | 라우트 테스트 |
| 얼굴 없는데 강제 셔터 | `canForceShutter`: 정면에서 얼굴 미검출이면 열지 않고 업로드 안내 | 테스트 C. E2E 가짜 카메라 9.5초: 셔터 disabled |
| 측면 없음 칸 높이 | 옆 칸 사진 비율을 따른다 | E2E: 측면 없음 111px = 가로형 환경 111px |
| '자주' 문구 | '자줏빛'(그 외 '노란·주황빛', '푸른빛', '초록빛'), 방향이 없으면 "화면 전체 색이 한쪽으로" | 테스트 |
| MediaPipe INFO가 console.error | 모델 생성 전 `quietMediapipeInfoLogs()`로 `INFO:`·`I/W####` 줄만 console.info로 돌린다 | 테스트. E2E console.error 0건, Issues 배지 없음 |

- test 4파일 50/50(기존 39 + 신규 11), typecheck·lint 0.
- E2E: 3101 dev(`CELEBER_FORCE_MOCK=1`, 분리 데이터 디렉터리), playwright-core 헤드리스. 스크린샷 `shots/cf-r1-*.png`. 서버 종료함.
- 남은 점: dev 표시기 "N" 아이콘은 여전히 왼쪽 아래에 있다(배지 없이 작아서 클릭은 된다). 프로덕션에는 없다.
