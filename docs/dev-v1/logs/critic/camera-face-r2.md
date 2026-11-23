# camera-face 독립 검증 라운드 2 (2026-11-24)

판정: **PASS** (major 0, minor 4). 3101 dev 실제 모드(분리 데이터 디렉터리), 헤드리스 Chromium + 가짜 카메라(y4m)와 업로드.

## 확인한 것
- `/pocs/camera-face`, `/pocs/camera-face/capture`, `/pocs/camera-face/sessions` → 307로 포트 루트 화면. 페이지 200.
- 실제 공급자: Anthropic 400(한도, 12-01 해제) 후 OpenAI `gpt-6.2-sol`. environment·analyze 모두 `aiSource: ai`, `isMock: false`.
- test 50/50, typecheck·lint 0. 캡처 응답 zod(업로드·환경·분석·세션·목록·latest) 통과.
- 라운드 1 결함 재확인
  - 측면에 정면 사진(S): "그래도 사용" + "정면에 가까운 사진이라(좌우 2°) 옆선은 분석하지 않습니다", analyze `profile=null`, `side:not-profile`. 해결.
  - 어두운 정면(D·E): "그래도 사용", 결과 상단 "신뢰도가 낮은 결과", 신뢰도 0.35/0.31. 잘린 사진(F) 0.49. 해결.
  - 없는 측면 uploadId → 404 `upload_not_found`. 해결.
  - 얼굴 없는 가짜 카메라(C): 28초 동안 셔터 비활성, 업로드 안내. 해결.
  - 측면 없음 칸 높이가 옆 환경 사진과 같다. '자줏빛' 문구. Issues 배지 없음(console.error 0건). 해결.
- 정상(A): 환경 혼합광 3,090K 실내, 정면 계란형, 측면 45° 볼록형. 잘못된 형식(텍스트·PDF) 400과 화면 안내, 61MB·66MB 413, 브라우저는 61MB를 줄여서 정상 처리.

## 남은 결함 (minor)
- poc: 정면 사진을 측면으로 쓴 결과의 '측면 옆선' 칸이 "측면 사진에서 얼굴을 찾지 못했습니다"로 나온다. 아래 경고(`side:not-profile`)와 어긋난다. `FaceAnalysisView.tsx:195`. 스크린샷 `cf-r2-S-S-result.png`.
- poc: 서버가 클라이언트가 보낸 yaw·품질 issues를 그대로 믿는다. API로 정면 랜드마크+yawDeg 60을 보내면 '오목형' 옆선이 저장된다. 정면 issues를 비우면 face-dark 경고·감점이 빠진다(0.31→0.44). 브라우저 경로는 해당 없음.
- core: 업로드 오류 문구 sharp 원문(7000×6272 → 400 'Input image exceeds pixel limit'), 깨진 SVG 업로드 200 후 environment·analyze(정면·측면) 500 glib 메시지. 라운드 1과 같음.
- core: ROI 픽셀 상한 미적용(A: 턱 5,181·볼 7,245px, S: 턱 12,545px). 같은 얼굴이 A ITA 75°, S ITA 46°로 갈린다. 라운드 1과 같음.

Codex 2차 의견 원문: `camera-face-r2-codex.txt`(재현한 것만 채택). 스크린샷 `cf-r2-*.png`. dev 서버 종료, 3101 LISTEN 0건.
