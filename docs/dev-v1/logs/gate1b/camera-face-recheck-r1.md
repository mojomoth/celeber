# camera-face minor 정리 독립 재검증 라운드 1 (2026-11-24)

판정: **PASS** (major 0, minor 3). 대상: [수정 r1](camera-face-fix-r1.md), 근거 이슈: [critic r2](../critic/camera-face-r2.md).

## 환경
- 3101 `pnpm dev`, 실제 모드, `pocs/.data` 사본을 `CELEBER_DATA_DIR`로 지정. 첫 호출에서 Anthropic 400(한도, 12-01 해제)이 난 뒤 OpenAI로 넘어감. `/api/meta`: `openai` / `gpt-6.2-sol`.
- 헤드리스 Chromium 390×844 @2x. 가짜 카메라(front.y4m)와 업로드. 입력은 critic r2와 같은 사진.
- 이 앱 test 59/59, typecheck·lint 0. personal-color-report test 57 통과(1 건너뜀).
- zod: 캡처한 analyze 10건, environment 1건, 조작 요청 8건, 목록 21건, 세션 상세, latest 모두 통과. `/pocs/camera-face{,/capture,/sessions}` 307. 서버 500 0건.

## 이전 이슈 재현
| 이슈 | 재현 | 결과 |
|---|---|---|
| 측면에 정면 사진을 넣으면 '측면 옆선' 칸 문구가 경고와 어긋남 | S: 측면에 front.jpg를 올림. 확인 화면에 "그래도 사용"이 뜨고 결과는 `profile` 없음 | 칸 문구가 "측면 사진이 정면에 가까워(좌우 2°) 옆선을 분석하지 않았습니다…"로 `side:not-profile` 경고와 같다. **해결** (`cfv1-S-profile-card.png`) |
| 서버가 클라이언트 yaw를 믿음 | T1: 정면 랜드마크에 yaw +60, −60, 90을 보냄 | 서버 yaw ±22°, `yaw:error`, 옆선 없음, `side:not-profile`. **해결** |
| 서버가 클라이언트 issues를 믿음 | T2: 어두운 정면에서 issues를 비우고 passed=true로 보냄. T5: face-dark를 warn으로 낮춰 보냄 | 세 요청 모두 `face-dark:error`, passed=false, 신뢰도 0.31로 정직한 요청과 같다(r2에서는 0.44). **해결** |
| 회귀(정직한 경로) | A(가짜 카메라 환경·정면, 측면 업로드), E(어두운 정면), M(좌우 반전한 측면) | A·E는 요청과 응답의 issues·yaw가 같다. 옆선은 A 볼록형, M 볼록형. AI 서술은 사진과 맞는다(직모, 가운데 가르마, 셔츠 깃) |

## 남은 결함 (minor)
1. **사진과 랜드마크의 일치는 검증하지 않음 (API로만 재현).** T6: 측면에 정면 사진을 올리고 M의 측면 랜드마크와 yaw 46.9를 보냄. 결과는 200이고 볼록형 옆선이 저장된다. 브라우저 경로는 해당 없음. r2 minor 2와 같은 종류가 남은 것이다. `src/server/index.ts:218`, `src/lib/quality.ts:238`
2. **yaw 허용 폭(근사값 +20°)이 정직한 촬영의 yaw를 깎음.** M(반전 측면)은 행렬 46.9°, 근사 25.1°이다. 확인 화면은 47°인데 결과는 45°다. 가로로 0.75배 줄인 반전 측면은 확인 화면이 55°이고 경고가 없다. 결과는 43°이고 새 경고 "조금 더 돌리면 옆선이 정확해집니다 (현재 43°)"가 붙는다. 옆선이 사라지는 사례는 재현하지 못했다. 다만 반전 사진에서 행렬과 근사의 차이가 21.8°라 측면 기준(35°) 근처의 촬영은 not-profile로 바뀔 수 있다. 실기기 HIL에서 확인할 것. `src/lib/quality.ts:249`
3. **(범위 밖, core) 정상 입력 A의 결과 상단에 "신뢰도가 낮은 결과"(47점)가 뜸.** r2에서는 0.54였다. 이번 변경 때문은 아니다. A의 정면·측면 품질값(issues, detectionScore, 밝기)은 요청과 응답이 같다. 차이는 core ROI 상한에서 온다. 피부 샘플이 15,382px에서 2,438px로 줄었고 "오른쪽 볼… 3곳으로 계산" 사유가 새로 붙었다. 붉은 혼합광 사진이라 낮은 신뢰도가 틀린 판정은 아니다.

## Codex sol 2차 의견 처리 ([원문](camera-face-recheck-r1-codex.txt))
- 채택: 사진·랜드마크 불일치(Codex는 major로 봄). 직접 재현했다(T6). 브라우저 경로는 해당 없고 r2 기준과 같은 종류라 minor로 분류했다. yaw 허용 폭이 정직한 촬영을 바꾸는 문제도 채택했다(M, 0.75배 사진).
- 미채택(재현 안 됨 또는 조작 요청에서만 생김): 옆선 소실(−40°→−31.4°), pitch 6°→20.8°(실사진에서 pitch는 바뀌지 않음), JPEG·리사이즈 경계(실입력의 밝기 차이 ≤0.1, 선명도 차이 ≤12. 판정은 바뀌지 않음), info/warn 병합, detectionScore 0(자기 결과만 낮아짐), 12×12 이미지 문구.

## 기타
- 처음 띄웠을 때 `/capture`가 dev HMR 새로고침을 반복했다(10초에 158회). 같은 시각에 다른 작업이 저장소 안 파일(`pocs/celeb-vibe-report/.hmr-data`)을 쓰고 있었다. 몇 분 뒤에는 1회로 돌아왔고 원인은 확정하지 못했다. dev 전용이다.
- AI 호출: environment 1, analyze 10(OpenAI). 조작 요청 8건은 `skipAi`.
- 스크린샷: `cfv1-A-A-result`, `cfv1-A-front-review`, `cfv1-S-side-review`, `cfv1-S-S-result`, `cfv1-S-profile-card`, `cfv1-E-E-result`, `cfv1-M-M-result` (`.png`).
- dev 서버 종료. 3101 LISTEN 0건. 다른 포트는 다른 작업 것이라 건드리지 않았다.
