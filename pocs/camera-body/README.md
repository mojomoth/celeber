# camera-body: 전신 비율 측정 PoC

정면 전신 사진 한 장으로 등신, 상·하체 비율, 다리 길이, 어깨·허리·골반 폭, 체형, 자세를 측정합니다. 결과는 사진 위 오버레이와 참조 범위 막대로 보여 주고, 수치마다 한 줄 해석을 붙입니다. 측정 기록은 SQLite `body_sessions`에 저장하고 다시 볼 수 있습니다. 측정 모듈은 `personal-color-report`가 import해서 씁니다.

- 패키지: `@celeber/camera-body`
- 포트: 3102 (`/pocs/camera-body/...` 접두사 경로도 같은 화면으로 연다. `next.config.ts` rewrites)
- API 네임스페이스: `/api/body/*`

## 실행

```bash
cd /Users/jyl/work/repo/celeber
pnpm --filter @celeber/camera-body dev        # http://localhost:3102
pnpm --filter @celeber/camera-body build && pnpm --filter @celeber/camera-body start
pnpm --filter @celeber/camera-body test       # vitest (순수 로직)
pnpm --filter @celeber/camera-body lint
pnpm --filter @celeber/camera-body typecheck
CELEBER_FORCE_MOCK=1 pnpm --filter @celeber/camera-body dev   # AI 호출 없이 실행
```

카메라는 `localhost`나 HTTPS에서만 열립니다. 휴대폰으로 시험하려면 터널(HTTPS)을 쓰거나 사진 업로드를 이용합니다.

## 화면 흐름

| 경로 | 역할 |
|---|---|
| `/` | 소개, 측정 시작, 데모 데이터로 결과 보기, 최근 기록 5건 |
| `/capture` | `BodyCaptureFlow`. 인트로에서 업로드(주), 카메라 촬영(보조), 건너뛰기 중 하나를 고릅니다. 이어서 분석, 확인, 저장 순서로 진행하고 저장이 끝나면 상세로 이동합니다. |
| `/sessions` | 기록 목록. 전체 초기화는 `ConfirmDialog`를 거칩니다. |
| `/sessions/[id]` | 결과 다시보기와 기록 1건 삭제. 결과 화면 구성은 아래와 같습니다. |

결과 화면 구성(`BodyResultView`)은 "사진 → 관찰한 특징 → 적용할 변화" 순서입니다.

1. 사진과 오버레이. 탭으로 전체 / 등신 / 폭 / 관절 / 사진만 보기를 고릅니다.
2. 요약: 등신, 체형, 상·하체 비율, 다리 비율, 어깨/골반 폭.
3. 측정 실패 사유와 정확도 경고.
4. 비율 섹션
   - 등신 비교 도식: 나와 기준 7.5등신을 나란히 놓고 머리·몸통·다리를 비교합니다.
   - 수치별 참조 범위 막대: 범위 띠, 기준 눈금, 내 값 마커, 한 줄 해석을 보여 줍니다.
5. 체형 섹션
   - 어깨·허리·골반 실루엣 도식과 5유형 점수 막대
   - 판단 근거
   - 골격 참고 분류
6. 자세: 어깨·골반·몸통 기울기.
7. 현재 코디: AI 사진 서술(부제에 실제 모델명). 키가 없으면 색 측정 요약과 "데모 데이터" 배지를 보여 줍니다.
8. 적용할 변화: 코디 제안과 피할 것.

건너뛰기를 고르면 `status: 'skipped'` 세션으로 저장합니다. 이 세션은 결과 화면과 후행 리포트에서 **"전신 사진 추가"** 자리표시(`BodyAddPlaceholder`)로 보입니다.

### 카메라 단계

`CameraShell`을 씁니다. 촬영 바탕은 어둡고, 화면에는 한 줄 지시, 고정 셔터, `BodyFrameGuide` 세로 프레임이 있습니다. 그 밖의 동작은 다음과 같습니다.

- PoseLandmarker(VIDEO)를 약 5fps로 돌려 실시간으로 안내합니다. 안내 문구는 "머리 위에 여백을 두세요", "발끝까지 들어오게 뒤로 물러나 주세요", "조금 더 가까이", "화면 가운데", "머리부터 발까지 들어왔어요" 중 하나입니다.
- 셀프 타이머를 끔 / 3초 / 10초로 바꿀 수 있습니다. 기본값은 3초입니다.
- 전면·후면 카메라를 전환할 수 있습니다.
- 업로드 대체 경로와 건너뛰기 버튼이 있습니다.

## 알고리즘

모든 측정은 브라우저에서 합니다. `@celeber/ui/mediapipe`가 로컬 wasm과 모델을 불러오므로 오프라인에서도 동작합니다. 서버는 검증, 코디 서술, 저장만 합니다.

1. **정규화된 저장본으로 분석.** 업로드 파일은 먼저 `/api/uploads`(kind `body`)에 저장합니다. 서버가 EXIF 회전과 sRGB 변환을 적용한 저장본(`/api/uploads/<id>`)을 다시 불러와 분석하므로, 오버레이 좌표가 저장 이미지와 정확히 맞습니다.
2. **PoseLandmarker(IMAGE).** `full` 모델로 최대 2명을 찾고 세그멘테이션 마스크를 함께 받습니다. 가장 크게 보이는 사람을 측정하고, 2명 이상이면 경고를 붙입니다.
3. **머리 길이(정수리~턱).**
   - 포즈의 머리 영역을 잘라 FaceLandmarker를 돌립니다. 머리 길이 = 1.25 × (턱(152) − 이마 상단(10))입니다. 이마 상단 점이 헤어라인 근처에 있으므로 정수리까지 보정하는 계수입니다.
   - 이 값이 '눈~턱 × 2 × 0.9'(`HEAD_EYE_FLOOR`)보다 짧으면 그 값까지 올립니다. 모자·앞머리로 10번 점이 낮게 잡히면 등신이 과대해지기 때문입니다(선바이저 사진 9.2 → 8.2등신). 이 보정만으로 정수리가 사진 위로 나가지는 않게 합니다.
   - 얼굴을 찾지 못하면 미술 해부학 비례를 씁니다. 눈은 머리 높이의 1/2 지점이고, 눈~입은 머리 높이의 1/3입니다.
   - 얼굴을 찾지 못했을 때는 머리가 사진 밖일 수 있습니다. 포즈 모델은 이때 티셔츠 안에 코·눈을 만들어 냅니다(visibility 1). 눈~어깨가 몸통(어깨~골반)의 0.3배보다 짧거나(`HEAD_NECK_MIN`), 마스크 머리 영역이 사진 맨 위에 닿거나, 마스크가 추정 정수리보다 머리 하나 넘게 위로 이어지면 `head-cropped`로 실패합니다.
   - 추정한 정수리가 마스크의 머리끝(헤어 포함)보다 위로 나가면 마스크 값으로 내립니다.
   - 얼굴 랜드마크는 길이 측정에만 쓰고 신원 판단에는 쓰지 않습니다.
4. **발바닥.** 먼저 발이 잘렸는지 판정합니다(`detectFeetCropped`). MediaPipe는 프레임 밖의 발 좌표를 외삽(y > 1)하고, 발목이 하단 경계에 걸쳐도 visibility를 높게 줄 수 있어서 visibility와 무관하게 봅니다. 아래 중 하나라도 맞으면 `feet-cropped`로 측정 실패입니다.
   - 발목 y ≥ 0.995
   - 뒤꿈치·발끝 중 하나라도 y ≥ 0.99
   - 발목 y > 0.97인데 프레임 안에 보이는 발 점이 없음
   - 사람 마스크가 발 범위에서 사진 마지막 행에 닿고, 관절점으로도 발이 하단 2.5% 안에 있음. 발 점이 그보다 위면 밑창이 경계에 붙은 것으로 보고 `feet-near-edge` 경고만 붙입니다(look-a).

   발목이 프레임 안에 있는데 visibility만 낮으면(어두운 사진, 가림) 잘림이 아니라 `feet-unclear`로 실패합니다.

   잘리지 않았으면 뒤꿈치와 발끝 점 가운데 가장 아래를 씁니다. 마스크 최하단이 그 아래 키의 5% 안에 있으면 마스크 값을 씁니다(두꺼운 밑창). 5%보다 더 아래거나, 허벅지/정강이 비가 1.3을 넘으면 발 관절점이 정강이에 찍힌 것으로 보고 `feet-uncertain`으로 실패합니다(어두운 사진 실측). 발이 흐리면 발목에 머리 길이의 0.3배를 더해 추정하고 경고합니다. 이 추정값이 사진 밖이면 키를 만들어 내지 않고 `feet-cropped`로 처리합니다.
5. **실루엣 폭.** 마스크의 각 행에서 몸 중심을 포함하는 연속 구간을 잽니다.
   - 어깨: 어깨 관절 아래 3~14% 띠의 최대 폭(삼각근 포함).
   - 허리: 몸통 45~85% 구간의 최소 폭.
   - 골반: 고관절에서 허벅지 35% 구간까지의 최대 폭.
   - 팔·손(어깨→팔꿈치→손목→손끝)이 허리·골반 행의 몸통 구간과 겹치면, 팔 중심선에서 팔 반폭(어깨 관절 폭 × 0.16)만큼 안쪽을 윤곽으로 보고 경고를 붙입니다.
   - 마스크가 없으면 관절점 폭으로 대신 재고, 표시와 참조 범위도 관절점 기준으로 바꿉니다.
   - 타당성 보정(`reconcileSilhouetteWidths`). 어깨 띠에는 위팔·소매가 들어가므로 실루엣 어깨 폭은 어깨 관절 폭 × 1.5를 넘지 않게 자릅니다. 팔을 빼고 잰 골반 폭은 근사이므로, 팔이 겹쳤고 실루엣 비가 관절점 환산 비와 0.12 넘게 어긋나면 두 비의 평균으로 골반 폭을 되돌립니다(하한: 고관절 점 폭 × 1.15). 보정하면 오버레이 폭선도 같은 중심에서 다시 그리고, 근거에 메모를 남깁니다.
6. **비율.**

   | 항목 | 계산 |
   |---|---|
   | 등신 | 키 / 머리 길이 |
   | 상체:하체 | (고관절 y − 정수리) : (발바닥 − 고관절 y) |
   | 다리/키 | (발바닥 − 고관절) / 키 |
   | 어깨/골반 | 어깨 폭 / 골반 폭 |
   | 허리/골반 | 허리 폭 / 골반 폭 |
   | 어깨 폭/키 | 어깨 폭 / 키 |
   | 허벅지/정강이 | 고관절~무릎 / 무릎~발목 |
   | 팔/키 | 어깨~팔꿈치~손목 / 키 |

   참조 범위는 성인 인체 측정 평균에서 잡은 대략치입니다(`src/lib/interpret.ts`).

   결과가 사람 범위를 벗어나면 `complete`로 내지 않습니다: 등신 3.5~10 밖, 어깨 폭/키 0.1 미만, 어깨·골반 기울기 15° 초과. 서버 `RATIO_BOUNDS`도 같은 값(등신 3.5~10, 어깨 폭/키 0.1~0.6)으로 저장을 거부합니다. 사진 평균 휘도가 0.35 미만이면 `low-light` 경고를 붙이고, 사람을 못 찾았을 때는 어둡다고 안내합니다.

7. **체형 5유형.** 어깨/골반 비 r과 허리/골반 비 w로 시그모이드·가우시안 소프트 점수를 내고 정규화합니다. 관절점 비는 1/1.3을 곱해 실루엣 비로 환산합니다. 경계값 측정이 100%로 보이지 않도록 점수를 균등 분포와 섞습니다(기본 10%, 관절점 환산·팔 겹침·어깨 상한 적용 시 최대 35%). 그래서 1위 점수는 최대 92%이고, 불확실한 측정은 더 낮게 나옵니다.

   | 유형 | 조건 |
   |---|---|
   | 역삼각형 | r ≥ 1.16 |
   | 삼각형 | r ≤ 0.96 |
   | 모래시계형 | r ≈ 1, w ≤ 0.75 |
   | 타원형 | w ≥ 0.94이고 허리/어깨 ≥ 0.9 |
   | 직사각형 | 나머지 |

8. **골격 3유형(스트레이트/웨이브/내추럴).** 비율에서 추정한 참고 분류입니다. 2D 사진으로는 뼈 굵기나 살의 질감을 알 수 없으므로 신뢰도를 0.45 이하로 제한합니다.
9. **자세.** 어깨 기울기와 골반 기울기가 4°를 넘거나, 몸통이 수직에서 5° 넘게 기울면 경고합니다. 무릎 각도가 160° 미만이면 경고하고, 120° 미만이면 측정 실패(앉은 자세)로 처리합니다.
10. **측정 실패.** 다음 경우에는 `status: 'failed'`와 한국어 사유를 반환합니다.
    - 사람을 찾지 못함
    - 몸통이 가려짐
    - 머리가 잘림
    - 발이 잘림
    - 앉은 자세

    다음 조건은 실패가 아니라 경고로 처리합니다: 사람이 작게 찍힘, 몸이 옆으로 돌아감, 팔이 몸통과 겹침, 여러 사람, 무릎이 가려짐.
11. **옷 색.** 몸통 중앙 사각형과 허벅지 띠에서 마스크 안의 픽셀만 모아 `robustMeanColor`로 평균을 냅니다. 이름은 `describeColor`로 붙입니다.

## AI 비전(선택)과 Mock 동작

- 저장할 때(`POST /api/body/analyze`) 이미지가 있으면 `callVisionStructured`로 현재 코디와 액세서리를 서술합니다.
  - 공급자는 core 순서(Anthropic → OpenAI → Mock)를 따르고 effort는 low입니다. 응답의 `model`이 실제 모델입니다.
  - 출력은 얕은 zod 스키마 `OutfitAiSchema`로 받습니다: summary, items[], accessories[], silhouetteNote.
  - 인물 식별 금지 정책(`IDENTITY_POLICY`)이 system 앞에 자동으로 붙습니다.
- 키가 없거나 강제 Mock이거나 호출이 실패하면, 측정한 옷 색으로 만든 요약을 씁니다. 이때 결과는 `source: 'mock'`과 warning을 갖고, 화면의 코디 섹션 옆에 "데모 데이터" 배지와 경고가 뜹니다.
- 코디 메타(출처, 모델, 경고, 측정 색, 품목)는 `kv`의 `body:outfit:<sessionId>`에 저장합니다. `BodyAnalysis.outfitDescription`에는 문자열 요약이 들어갑니다.
- 비율 측정 자체는 키와 무관하게 실제로 측정합니다(`source: 'rules'`, AI 서술이 붙으면 `'hybrid'`).
- **데모 데이터로 결과 보기**(`POST /api/body/demo`)는 같은 좌표로 그린 도식 SVG, 합성 관절점, 합성 마스크로 데모 세션을 만듭니다(`isMock: true`). 측정 → 저장 → 시각화 전체 경로를 사진 없이 확인할 수 있고, 결과에 데모 배지가 붙습니다.

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/body/analyze` | 아래 본문으로 저장합니다. skipped와 failed도 저장할 수 있습니다. `analysis.image.uploadId`가 업로드 기록에 없으면 400 `upload_not_found`, 업로드 kind가 `body`가 아니면 400 `upload_kind_mismatch`이고, `image.url`은 서버가 `/api/uploads/<id>`로 다시 만듭니다. 응답: `{session, outfit}` |
| GET | `/api/body/sessions?limit=` | 목록 `{items: BodySessionListItem[]}` |
| DELETE | `/api/body/sessions?confirm=1` | `body_sessions` 전체 삭제(이 PoC 테이블만) |
| GET | `/api/body/sessions/[id]` | `{session, outfit}`, 없으면 404 |
| DELETE | `/api/body/sessions/[id]` | 1건 삭제 |
| POST | `/api/body/demo` | 데모(Mock) 세션 생성 |
| GET/POST | `/api/health`, `/api/meta`, `/api/uploads`, `/api/uploads/[id]` | 공통 |

`POST /api/body/analyze` 요청 본문은 `{analysis: BodyAnalysis, label?, outfitColors?, describeOutfit?}`입니다.

- `outfitColors.*.hex`는 `#RRGGBB`만 받습니다(그 밖은 400 `validation_error`). `nameKo`는 40자 이하로 받되 저장·AI 프롬프트에는 쓰지 않고, 서버가 hex로 다시 계산합니다(`sanitizeOutfitColors`). 화면에서도 `safeHex`를 통과한 값만 인라인 style에 넣습니다.

업로드 파일은 sha 기준으로 다른 앱과 공유될 수 있으므로 세션을 삭제해도 지우지 않습니다.

## 후행 PoC용 export

```ts
// 플로우 ('use client')
import { BodyCaptureFlow, analyzeBodyImage, errorMessage } from '@celeber/camera-body/flow';
<BodyCaptureFlow
  apiBase=""                                   // 호스트 앱에 /api/uploads, /api/body/analyze 필요
  steps={['환경', '정면', '측면', '전신']} currentStep={3}
  onComplete={({ analysis, session, outfit }) => ...}   // analysis.status: complete | failed | skipped
  onSkip={(r) => ...}                          // 선택. 없으면 onComplete로 skipped 전달
  persist describeOutfit allowSkip
/>

// 결과 컴포넌트
import { BodyResultView, BodyAddPlaceholder, BodyPhotoPanel, BodyOverlay, RatioBars, ProportionDiagram, SilhouetteDiagram } from '@celeber/camera-body/components';

// 순수 함수
import { computeBodyAnalysis, toBodyStyling, bodyOneLiner, bodySummaryRows, createSkippedBodyAnalysis, buildStylingGuide, POC_INFO } from '@celeber/camera-body/lib';
const bodyStyling = toBodyStyling(bodyAnalysis); // PersonalColorReport.bodyStyling 형태, 미측정이면 null

// 서버 (route handler / server component)
import { getBodySession, listBodySessions, latestCompleteBodySession, saveBodySession } from '@celeber/camera-body/server';
```

호스트 앱 라우트 재노출(예: personal-color-report):

```ts
// app/api/body/analyze/route.ts
export { analyzePOST as POST } from '@celeber/camera-body/routes';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 필요 시: app/api/body/sessions/route.ts → sessionsGET as GET, app/api/body/sessions/[id]/route.ts → sessionGET as GET
```

## 한계

- 참조 범위와 계수는 경험값이고, 실측 데이터로 튜닝하지 않았습니다. 해당 값: 머리 보정 1.25, 관절점→실루엣 1/1.3, 팔 반폭 0.16, 유형 임계값.
- 2D 단일 사진이라 다음 요인에 따라 수치가 달라집니다.
  - 카메라 높이와 원근: 낮게 찍으면 다리가 길게 나옵니다.
  - 렌즈 왜곡
  - 신발 굽
  - 헤어 볼륨: 마스크 보정 시 정수리에 포함됩니다.
  - 옷 부피: 실루엣 폭에 포함됩니다.
- 손이 허벅지에 붙으면 골반 폭은 팔 위치를 빼고 추정한 값입니다.
- 골격 진단 3유형은 참고 분류입니다. 의학적 체형 진단이 아닙니다.
- HEIC는 서버(sharp)에서 디코딩하지 못할 수 있습니다. 파일 선택은 JPEG/PNG/WebP로 제한합니다. 카메라 셸의 업로드 버튼은 공용 컴포넌트라 `image/*`를 받으므로, 올리기 전에 형식(JPEG·PNG·WebP)과 크기(25MB)를 검사하고 HEIC면 JPEG로 바꿔 달라고 안내합니다(`src/flow/uploadMessages.ts`).
- `proxy.ts`가 있으면 Next가 요청 본문을 `experimental.proxyClientMaxBodySize`(기본 10MB)까지만 넘깁니다. `next.config.ts`에서 36MB(core `MAX_UPLOAD_BODY_BYTES`)로 올렸습니다. 이 앱의 flow를 쓰는 호스트 앱도 같은 설정이 필요합니다.
- PoseLandmarker는 `full` 모델이 기본입니다. 정확도가 더 필요하면 `poseModel="heavy"`(30MB)를 씁니다.
