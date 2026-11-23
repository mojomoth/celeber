# camera-face 독립 검증 라운드 1 (2026-11-24)

판정: **FAIL** (major 1). 3101 dev(분리 데이터 디렉터리), 헤드리스 Chromium + 가짜 카메라(y4m)와 업로드.

## 확인한 것
- `/pocs/camera-face`, `/capture`, `/sessions`, `/api/meta` → 307로 포트 루트 화면. 페이지 200.
- 실제 공급자: 첫 호출 Anthropic 400(한도) 후 OpenAI `gpt-6.2-sol`. environment·analyze 모두 `aiSource: ai`, `isMock: false`.
- zod: 업로드·환경·분석 응답, 세션 상세 3건, 목록, latest 32건 통과. test 39/39, typecheck·lint 0.
- 입력별 결과: 정상(가짜 카메라 전 과정), 사람 없는 사진(얼굴 미검출, 사용하기 비활성), 어두운 사진(too-dark·재촬영 권장, 피부 신뢰도 38~42%), 텍스트·PDF(400/화면 안내), 61MB·66MB(413, 브라우저 경로는 축소 후 정상), 7000×6272(400 영문 메시지).

## 결함
- major: 측면 단계에 정면 사진(yaw 2°, error)을 넣어도 사용하기가 켜지고 결과에 "오목형·균형형·코 돌출 0.6%"가 측정값처럼 저장된다. 같은 인물 실제 측면은 볼록형. `src/lib/analysis.ts:86,92`, `src/flow/FaceCaptureFlow.tsx:366`. 스크린샷 `cf-S-side-review.png`, `cf-S-S-result.png`.
- minor: 아래 StructuredOutput 이슈 목록과 같다. Codex 2차 의견 원문은 `camera-face-r1-codex.txt`(직접 재현한 것만 채택).

## 스크린샷
`cf-<시나리오>-*.png`: A 가짜 카메라 전 과정, C 얼굴 없는 카메라, N 사람 없는 사진·잘못된 형식·큰 파일, D 어두운 사진, E 환경 생략+어두운 사진, F 스튜디오 사진, S 측면에 정면 사진.

dev 서버 종료, 3101 LISTEN 0건.
