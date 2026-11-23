# camera-face minor 수정 라운드 1 (2026-11-24)

대상: [critic r2](../critic/camera-face-r2.md)의 앱 minor 2건. core 2건(sharp 원문 오류, ROI 상한)은 scope 밖이라 손대지 않음.

1. 정면 사진을 측면으로 쓴 결과의 '측면 옆선' 칸 문구
   - 재현: `side:not-profile`인데 빈 칸이 "측면 사진에서 얼굴을 찾지 못했습니다".
   - 수정: `profileEmptyMessage()`(src/lib/analysis.ts)를 두고 `FaceAnalysisView`가 사용. not-profile이면 경고와 같은 문구("정면에 가까워(좌우 N°) …").
2. 서버가 클라이언트 yaw·품질 issues를 그대로 믿음
   - 재현(라우트 테스트): 정면 랜드마크+yawDeg 60 → 옆선 저장, 어두운 정면+issues [] → face-dark 경고 없음. 둘 다 수정 전 실패 확인.
   - 수정: `verifyCapture()`(src/lib/quality.ts). 저장 픽셀과 랜드마크로 품질을 다시 평가하고 클라이언트 issues와 합침(같은 코드면 더 엄격한 쪽). yaw는 랜드마크 근사값 기준 -8°~+20° 안으로, pitch ±15°, roll은 근사값. `analyzeFaceCapture`가 정면·측면에 적용. `faceLumaOf`는 lib로 옮기고 flow에서 그대로 다시 export.
   - 실제 저장 캡처 4건(정면·측면)을 사본 DB로 재생: issues·yaw 변화 0건.

확인: test 59/59(신규 `test/critic-r2.test.ts` 9건), typecheck 0, lint 0. dev 서버는 띄우지 않음.
