# Gate 1: camera-body 입출력 검증 (2026-11-24)

- 실행: `pocs/camera-body`에서 `pnpm dev`(3102), `CELEBER_FORCE_MOCK` 없음. 공유 DB를 건드리지 않도록 `CELEBER_DATA_DIR`은 스크래치 폴더의 빈 디렉터리로 지정했다. 작업 후 서버를 종료했다.
- 브라우저: Playwright 1.64.1(npx 캐시) + chromium 1248 헤드리스, 430×932. MediaPipe는 GPU 생성에 실패해 CPU(XNNPACK)로 동작했다.
- 시나리오: `/pocs/camera-body/capture` → 사진 업로드 → 브라우저 측정 → "이 결과 사용" → `POST /api/body/analyze` → 상세 화면.

## `/pocs/camera-body` 경로

| 요청 | 처음 | 수정 후 |
|---|---|---|
| `/pocs/camera-body`, `/pocs/camera-body/capture`, `/pocs/camera-body/sessions`, `/pocs/camera-body/api/health` | 404 | 200 |
| `/pocs/camera-body/` | - | 308 → `/pocs/camera-body` |
| `/`, `/capture`, `/sessions` | 200 | 200 |

`next.config.ts`에 rewrites 2줄을 추가했다. basePath를 쓰면 허브 링크와 후행 앱이 재노출하는 `/api/body/*` 경로가 바뀌므로 쓰지 않았다. 접두사로 연 뒤 화면 안 링크(`/sessions/<id>` 등)는 접두사 없이 이동한다. 허브(3100) 한 곳에서 `/pocs/<앱>`을 모두 열려면 허브 rewrites와 각 앱 basePath가 함께 필요하다(오케스트레이터 결정 사항).

## 실제 입출력

입력 사진: `pocs/core/fixtures/demo-people/look-b.jpg`, `look-a.jpg`, look-a 아래에 배경색 60px을 덧댄 사본(look-a-pad), look-b의 가운데만 잘라 머리와 발이 빠진 사본(cropped).

| 사진 | 측정 | 저장 | 결과 | 등신 | 다리/키 | 상:하 | 체형 | 코디 서술 |
|---|---|---|---|---|---|---|---|---|
| look-b | 10~13초 | 200, 4.8~6.3초 | complete, `source: hybrid`, `isMock: false` | 9.23 → **8.18**(수정 후) | 0.515 | 0.94 | 역삼각형 78% | `ai`, gpt-6.2-sol |
| look-a | 10~14초 | 200 | failed `feet-cropped` | - | - | - | - | `ai`, gpt-6.2-sol |
| look-a-pad | 11~14초 | 200 | complete | 7.73 | 0.529 | 0.89 | 역삼각형 81% | `ai`, gpt-6.2-sol |
| cropped | 10~12초 | 저장 안 함 | failed `feet-cropped` | - | - | - | - | - |

- 응답 `{session, outfit}`은 서버에서 `AnalyzeResponseSchema` 계약으로 만든 값이다(`BodyAnalysisSchema.parse`, `OutfitMetaSchema.parse`). AI 응답은 core가 `OutfitAiSchema`로 다시 검증한다.
- 공급자: 첫 호출에서 Anthropic이 400(사용 한도, 12-01 해제)을 반환해 차단됐고, 그 뒤로는 OpenAI가 응답했다. 호출 뒤 `/api/meta`는 `aiProvider: openai, model: gpt-6.2-sol, aiBlockedReason: null`이었다.
- Mock 배지: 실제 사진 결과 화면 3건 모두 "데모 데이터" 0개였다.
- 코디 서술과 사진의 일치: look-b는 크림색 반팔 티셔츠, 옆면 추상 프린트 쇼츠, Y-3 선바이저, 흰 양말, 운동화로 서술했고 사진과 맞는다. look-a는 라이트 베이지 크루넥 스웨트셔츠, 차콜 턱 와이드 슬랙스, 검정 구두, 회색 토트백으로 서술했고 역시 맞는다. 인물 신원 언급은 없었다.
- 측정 타당성(수정 후)
  - 등신: look-b 8.18, look-a-pad 7.73. 성인 범위(6.5~8)의 위쪽 끝이고, 패션 모델 사진이라 상식 범위에 든다.
  - 다리/키 0.52~0.53, 상:하 0.89~0.94, 허벅지/정강이 1.00~1.06은 모두 참조 범위 안이다.
  - 어깨/골반 1.33~1.60은 높게 나왔다. 오버핏 소매와 드롭 숄더가 어깨 폭에 들어간 결과이며, 근거에 "옷 부피 반영 가능" 메모가 붙는다.
  - 팔/키 0.31은 범위 하한이다. 한 손이 주머니에 들어가 있다.
  - 오버레이의 정수리, 턱, 어깨·허리·골반 폭선, 골격선이 사진과 맞는다(`shots/camera-body-look-b-result.png`).

## 고친 문제

1. **모자를 쓰면 등신이 과대해졌다(9.23등신).** 선바이저 챙 아래로 얼굴 10번 점이 내려와 머리 길이(1.25 × 이마~턱)가 짧게 잡혔다. 눈은 머리 높이의 약 1/2이므로, 얼굴 기준 머리 길이가 `눈~턱 × 2 × 0.9`(`HEAD_EYE_FLOOR`)보다 짧으면 그 값까지 올리도록 고쳤다. 이 보정 때문에 정수리가 사진 위로 나가 '머리 잘림'이 되지는 않게 했다. 결과는 9.23에서 8.18로 내려왔다. look-a-pad에도 보정이 걸렸다(1.25 계수가 이 사진에서도 짧게 잡는다). 근거 문구는 "이마 점이 낮게 잡혀 눈 위치로 보정"이다. `src/lib/analyze.ts`, 테스트 2개.
2. **OpenAI가 응답해도 "Claude 비전 서술 · gpt-6.2-sol"로 표시됐다.** 공급자 이름을 빼고 `AI 사진 서술 · <모델>`로 바꿨다(`outfitSourceLabel`). `src/lib/outfit.ts`, `BodyResultView.tsx`, 테스트 1개.
3. **코디 문구가 어색했다.** 품목 표시에서 색이 겹쳤고("검정 검정 밑창"), 문장이 '~다'체와 '~입니다'체로 섞였다. 프롬프트에 "색은 colorName에만", "~입니다/~합니다로 끝내기"를 추가했다. 재실행 결과는 반복 없이 '~입니다'체로 나왔다.
4. `/pocs/camera-body` 접두사 경로를 추가했다(위 표).

검증 결과: camera-body는 test 40개 통과(37 → 40), typecheck와 lint 오류 0이다. 이 앱의 flow와 components를 import하는 personal-color-report도 test 32개 통과, typecheck 오류 0이다.

## 제한·미해결

- **look-a 원본은 측정 실패(`feet-cropped`)로 나온다.** 구두 밑창이 사진 아래 경계에서 2~3px 떨어져 있어서 마스크가 마지막 행에 닿는다. 발을 판정하는 보수 규칙(`mask-at-edge`)이 의도대로 동작한 결과다. 아래 여백을 60px 넣으면 측정된다. 데모 사진을 측정용으로 쓰려면 여백을 넣은 사본이 필요하다(core fixtures 소관).
- **두꺼운 밑창은 발바닥이 높게 잡힌다.** look-a-pad에서는 발끝 점 1862px이 실제 밑창 약 1937px보다 75px 높다(키의 약 4%). 마스크 보정 창(발 점 아래 3%)을 벗어나 마스크 값을 쓰지 않았다. 등신이 약 0.3 작게 나온다. 계수는 고치지 않았다.
- **머리가 프레임 밖이면 포즈 모델이 티셔츠 안에 가짜 머리를 만든다**(cropped: 코 y=0.27, visibility 1). 결과는 발 잘림으로 실패 처리되지만, 사유에 '머리 잘림'이 빠지고 어깨 44°, 골반 36° 같은 무의미한 자세 경고가 함께 나온다.
- **dev 오버레이에 "1 Issue"가 뜬다.** MediaPipe가 `console.error`로 찍는 INFO 로그("Created TensorFlow Lite XNNPACK delegate") 때문이다. dev 모드에서만 보이며 기능 오류는 아니다.
- 측정은 헤드리스 CPU 기준 10~14초 걸렸다. 실제 브라우저(GPU)에서는 더 빠를 것으로 보지만 재지 않았다.
- 같은 스크래치 폴더를 다른 검증 에이전트가 함께 써서 테스트 사진 하나(look-a-pad.jpg)가 덮어써진 일이 있었다. 이후 전용 하위 폴더로 옮겨 다시 실행했고, 위 수치는 다시 실행한 결과다.

## 스크린샷 (`shots/`)

`camera-body-home.png`(`/pocs/camera-body`), `camera-body-capture.png`, `camera-body-look-b-review.png`, `camera-body-look-b-result.png`, `camera-body-look-a-review.png`, `camera-body-look-a-result.png`(측정 실패 기록), `camera-body-look-a-pad-review.png`, `camera-body-look-a-pad-result.png`, `camera-body-cropped-review.png`, `camera-body-sessions.png`
