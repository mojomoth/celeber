# Gate 1: camera-face 실제 입출력 검증 (2026-11-24, 구현 측)

결론: **PASS**. 가짜 카메라 경로와 업로드 경로 모두 실제 AI 공급자(OpenAI `gpt-6.2-sol`)의 응답으로 끝까지 진행되었고, 모든 응답이 zod 계약을 통과했다. 버그 1건을 고쳤다.

## 환경

- `pnpm dev`(포트 3101), 실제 모드(`CELEBER_FORCE_MOCK` 없음). 공유 DB를 건드리지 않도록 `pocs/.data` 사본을 `CELEBER_DATA_DIR`로 지정했다.
- 브라우저: Playwright 1.64.1(npx 캐시)의 Chromium headless, 390×844 @2x. 가짜 카메라는 `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=<front.y4m>`이다.
- 입력 사진(데모 사진, 리포지토리 안):
  - 정면: `docs/ui/refs/screens/03-doji-front-selfie.jpg`에서 사진 부분만 잘라 냄(960×860). 주황 나무 벽, 붉은 실내광.
  - 측면: `docs/ui/refs/screens/04-doji-side-selfie.jpg` 같은 방식. 회백색 벽.
  - 카드: `docs/ui/personal-color-report-guide/navy-men-personal-color-report-card.jpeg`의 인물 사진(396×372). 밝은 회색 스튜디오 배경.
  - `pocs/core/fixtures/demo-people`은 전신 사진이라 얼굴 크기가 작아 쓰지 않았다.

## 경로

| 요청 | 결과 |
|---|---|
| `/`, `/capture`, `/sessions`, `/api/health` | 200 |
| `/pocs/camera-face`, `/pocs/camera-face/capture` (수정 전) | 404 |
| 같은 경로 (수정 후) | 307 → `/`, `/capture`. 브라우저에서 `/pocs/camera-face/capture`로 열어 B 실행 완료 |

허브는 `http://<host>:3101/<page>`로 링크한다(`pocs/hub/src/pocs.ts`의 `pocUrl`). basePath를 쓰면 플로우의 `/api/face/*` 호출과 후행 앱 재노출 경로가 바뀌므로 리다이렉트만 추가했다.

## 실행 결과

| 실행 | 환경 | 정면 | 측면 | API | AI 출처 |
|---|---|---|---|---|---|
| A | 가짜 카메라 셔터 | 가짜 카메라 셔터(실시간 체크 통과 후 4.0초에 셔터 활성) | 업로드 | uploads 200 ×3, environment 200(3.5초), analyze 200(7.8초) | `ai`, `source: hybrid`, `isMock: false` |
| B | 업로드(카드) | 업로드(카드) | 건너뛰기 | uploads 200 ×2, environment 200, analyze 200 | `ai`, `hybrid`, `isMock: false` |

- 공급자: 프로세스마다 첫 호출이 Anthropic 400(사용 한도, 12-01까지)을 한 번 거친 뒤 OpenAI로 넘어갔다. 이후 `/api/meta`는 `aiProvider: openai`, `model: gpt-6.2-sol`이다. 화면에 "데모 데이터" 배지가 없다(같은 목록의 이전 Mock 세션 2개에는 있다).
- zod: 캡처한 응답 본문 전부(실행 3회: A, 수정 전 B, 수정 후 B. Upload 7, `EnvironmentResponseSchema` 3, `AnalyzeResponseSchema` 3), `GET /api/face/sessions/<id>`(`FaceSessionSchema`), 목록(`FaceSessionSummarySchema`), `latest`(`FaceAnalysisSchema`)가 통과했다.

### 사진과 비교한 내용 (A)

| 항목 | 결과 | 사진과 맞는가 |
|---|---|---|
| 환경 | 혼합광 3,050K(신뢰도 0.2), 실내 0.9, 밝기 적정, 경고: 혼합광·주황 색 치우침. AI 메모: "전구색 실내 조명 위주, 붉은 갈색 벽 반사로 피부가 붉게 보일 수 있음" | 맞다. 붉은 벽과 따뜻한 실내광이다 |
| 피부 | 보정 전 #C58383 → 보정 후 #B48386, 게인 R 0.556, 강도 0.4, 신뢰도 0.54 | 붉은 기가 남았지만 신뢰도와 경고가 이를 알린다. 아래 제한 참고 |
| 부위 색 | 헤어 #0A021A 블랙, 눈동자·눈썹 "와인", 입술 #853949 | 헤어는 맞다. 눈썹·눈동자 이름이 붉은 조명 영향으로 "와인"이 된다 |
| 윤곽 | 계란형 58%(L 1.19, J 0.81), 기울기 경고(roll 7.3°) | 윤곽선 오버레이가 얼굴에 잘 맞고, 사진의 고개도 실제로 기울어 있다 |
| 측면 | 볼록형, 입술이 E-라인 앞, 코 돌출 12.3%, yaw 43° 경고 | 맞다. AI 서술도 "입술이 코끝–턱끝 선보다 약간 앞"으로 같다 |
| AI 서술 | 목덜미 길이 직모·가운데 가르마, 짙은 검정, 짙고 두꺼운 눈썹, 차분하고 단정한 인상, `presentation: male` | 맞다. 신원 언급 없음 |

B(카드): 주광색 6,220K, 실내, 피부 #E3C3AF 로지 베이지(ITA 66°), 네 ROI 모두 측정, 신뢰도 0.8, 계란형 73%, 눈동자 에스프레소·입술 코럴 핑크. AI 서술은 짧은 옆머리·가운데 가르마·어두운 니트로 사진과 맞다.

## 고친 버그

**밝은 배경을 과다 노출로 판정해 재촬영을 권함** (`src/lib/environment.ts` `classifyBrightness`)

- 증상: 카드 사진은 밝기 중앙값 236, 포화 0.1%인데 `too-bright`(error)가 되어 "하얗게 날아간 부분이 많습니다"와 재촬영 권장이 나왔다. AI 메모는 "부드러운 확산 조명"이었다. 흰 벽 앞 촬영에서 같은 일이 생긴다.
- 수정: 중앙값 215 초과만으로는 과다 노출로 보지 않고 포화 5% 초과가 함께 있어야 한다. 포화 30% 초과 조건은 그대로 두었다.
- 확인: 재실행 B에서 `bright`, 재촬영 권장 없음, 조명 품질 0.49 → 0.83. 테스트 2줄 추가(`test/environment.test.ts`), README 기준 문구 수정.

검증: `pnpm --filter @celeber/camera-face test` 39개 통과, typecheck·lint 오류 없음. 이 앱을 쓰는 personal-color-report 테스트 32개도 통과했다.

## 제한·미해결

- **피부 전체값이 턱에 끌려감 (core)**: A에서 턱 ROI가 12,926px로 전체 샘플의 68%를 차지해, 전체값(L 59.6)이 이마·볼(L 76~78)보다 턱(L 46.9)에 가깝다. `sampleFaceColors`의 ROI별 상한(`maxPixelsPerRegion` 6000)이 `Math.floor(sqrt(area/max))`라서 면적이 상한의 4배 미만이면 step이 1이 되어 상한이 걸리지 않는다. core 수정 제안을 남긴다.
- **강한 붉은 조명에서 볼 하나가 빠짐**: A의 오른쪽 볼(사진 왼쪽)은 YCbCr 피부 범위(Cr ≤ 180)를 벗어나 측정되지 않았다(ROI 3곳). 신뢰도 사유에는 표시되지 않는다(3곳 미만일 때만 표시).
- **dev 오버레이 "Issues"**: 촬영 중 MediaPipe wasm이 `INFO: Created TensorFlow Lite XNNPACK delegate for CPU.`를 `console.error`로 찍어 Next dev 오버레이에 1~2건이 뜬다. 스크린샷 왼쪽 아래 빨간 배지가 이것이다. 새로 연 `/`, `/sessions`, `/sessions/<id>`에는 콘솔 오류가 없다. 프로덕션에서는 오버레이가 없다.
- 측면 사진은 MediaPipe yaw가 43°로 나와 항상 "조금 더 돌리면" 경고가 붙는다(README에 적힌 기존 한계).
- 가짜 카메라는 파일 하나만 재생하므로 측면은 업로드로 검증했다. 실제 휴대폰 카메라 촬영은 HIL 대상이다.
- 비용: 이번 검증에서 AI 호출은 environment 3회, analyze 3회다.

## 스크린샷 (`shots/`)

`camera-face-home`, `-intro`, `-env-camera`, `-env-result-A`, `-front-camera`, `-front-review-A`, `-side-review`, `-result-A`, `-sessions`, `-env-result-B`, `-front-review-B`, `-result-B` (`.png`)

## 종료

dev 서버(3101)를 종료했다. 3101 LISTEN 0건. 다른 포트(3102~3106)는 다른 작업의 서버라 건드리지 않았다.
