# camera-face — 환경·정면·측면 촬영으로 피부색과 얼굴 윤곽 추출

CELEBER PoC. 조명 환경을 먼저 찍고, 정면과 측면 얼굴을 찍어 다음 두 가지를 측정합니다.

- 조명 보정한 피부색: sRGB hex, CIELAB, ITA°, hue angle, chroma
- 얼굴 윤곽과 이목구비 비율, 측면 옆선(E-라인)

결과는 SQLite `face_sessions`에 저장합니다. 결과 계약은 `FaceAnalysis`(`@celeber/core/contracts`)이고, 후행 PoC `personal-color-report`가 이 값을 입력으로 씁니다.

## 실행

```bash
cd /Users/jyl/work/repo/celeber
pnpm --filter @celeber/camera-face dev     # http://localhost:3101 (predev에서 BI·MediaPipe 에셋 동기화)
pnpm --filter @celeber/camera-face build && pnpm --filter @celeber/camera-face start
pnpm --filter @celeber/camera-face test    # vitest 37개 (순수 로직 + 라우트 통합)
pnpm --filter @celeber/camera-face lint
pnpm --filter @celeber/camera-face typecheck
CELEBER_FORCE_MOCK=1 pnpm --filter @celeber/camera-face dev   # AI 없이(Mock 서술) 강제
```

카메라는 `localhost` 또는 HTTPS에서만 열립니다. 모든 촬영 단계에는 **업로드** 버튼이 있어 데스크톱이나 테스트에서는 사진 파일로 진행할 수 있습니다.

## 화면 흐름

| 경로 | 내용 |
|---|---|
| `/` | 단계 소개, 촬영 시작, 최근 분석 3개 |
| `/capture` | 촬영 플로우 `FaceCaptureFlow`. 아래 단계 표 참고 |
| `/sessions` | 세션 목록. 썸네일, 라벨(날짜·광원), 피부색, 얼굴형을 보여줍니다. 개별 삭제와 전체 삭제는 확인 다이얼로그를 거칩니다 |
| `/sessions/<id>` | 다시보기(`FaceAnalysisView`). 사진·윤곽 오버레이 → 피부색 → 부위 색 → 얼굴 윤곽 → 측면 옆선 → 환경 → 서술 → 다음 단계 순서 |

`/capture`의 단계:

| 단계 | 하는 일 |
|---|---|
| 1. 안내 | 촬영 전 조건 3줄과 흰 종이 안내. "환경 촬영 건너뛰기"도 여기서 고릅니다 |
| 2. 환경 촬영 | 모서리 프레임 가이드와 실시간 밝기 표시. 셔터, 업로드, 카메라 전환을 둡니다 |
| 3. 환경 결과 | 광원, 색온도, 밝기, 실내·실외, 조명 품질과 경고를 보여줍니다. 사진 속 흰 종이를 누르면 그 지점이 기준 백색이 됩니다(선택). 재촬영을 권장할 때는 "조명을 바꾸고 다시 촬영"을 주 버튼으로 둡니다 |
| 4. 정면 촬영 | 흰 타원 가이드. 실시간 품질 체크(약 10fps)를 하고, 연속 3프레임을 통과해야 셔터가 켜집니다. 8초 넘게 통과하지 못하면 경고와 함께 셔터를 허용합니다. 얼굴이 아예 안 잡히면 열지 않고 업로드를 안내합니다. 촬영 후 윤곽선 미리보기를 보고 "다시 촬영" 또는 "사용하기"를 고릅니다. 품질 오류가 있으면 버튼이 "그래도 사용"으로 바뀌고 신뢰도가 낮아진다고 알립니다 |
| 5. 측면 촬영 | 프로필 가이드. 옆선과 E-라인 미리보기를 보여주고, 건너뛸 수 있습니다. 정면에 가까운 사진(\|yaw\| 35° 미만)은 "그래도 사용"으로만 넘어가고 옆선을 만들지 않습니다(`side:not-profile`) |
| 6. 분석 | 정면 사진 위에 분석 중 오버레이를 띄우고, 끝나면 `/sessions/<id>`로 이동합니다 |

## API (`/api/face/*`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/face/environment` | 환경 사진을 분석하고 in-progress 세션을 만들거나 갱신합니다. 요청 본문은 `{uploadId, sessionId?, whitePoint?:{x,y}, skipAi?}`, 응답은 `{sessionId, environment, metrics, whiteReference, aiSource, warning?}`. 서버가 저장 이미지 픽셀을 sharp로 다시 읽어 계산합니다 |
| POST | `/api/face/analyze` | 정면/측면 분석 후 세션을 완료 상태로 저장합니다. 아래 요청 형식 참고. 정면이나 측면 `uploadId`가 없으면 404 `upload_not_found`(측면을 건너뛸 때는 `side: null`) |
| GET | `/api/face/sessions?status=complete&limit=20` | 세션 요약 목록 |
| DELETE | `/api/face/sessions?confirm=1` | 얼굴 세션 전체 삭제. `face_sessions` 행만 지웁니다 |
| GET / DELETE | `/api/face/sessions/<id>` | 세션 상세 조회 / 삭제 |
| GET | `/api/face/latest` | 가장 최근 완료된 `{sessionId, analysis}` |
| 공통 | `/api/uploads`, `/api/uploads/<id>`, `/api/health`, `/api/meta` | 기반 단계에서 만든 공통 라우트 |

`POST /api/face/analyze` 요청 본문:

```json
{
  "sessionId": "...",
  "front": {
    "uploadId": "...",
    "landmarks": ["478점"],
    "yawDeg": 0, "pitchDeg": 0, "rollDeg": 0,
    "quality": {},
    "fromUpload": false,
    "mask": { "width": 0, "height": 0, "data": "base64" }
  },
  "side": "front와 같은 형식, landmarks는 null 가능 | null",
  "skipAi": false
}
```

응답은 `{sessionId, session, analysis: FaceAnalysis, aiSource, warning?}`입니다.

요청과 응답 스키마는 `src/lib/api.ts`(zod)에 있습니다.

**업로드 이미지는 세션을 삭제해도 남깁니다.** 업로드는 sha256과 kind가 같으면 다른 앱이나 세션과 같은 파일을 공유하기 때문입니다.

## 알고리즘과 근거

### 1) 환경 (`src/lib/environment.ts`)

- **밝기**
  - 휘도 히스토그램으로 중앙값, 포화(어느 채널이든 252 이상) 비율, 암부(10 이하) 비율을 구합니다.
  - 등급: 중앙값 40 미만 너무 어두움, 75 미만 어두움, 185 이하 적정, 그보다 밝으면 밝음입니다. 과다 노출은 중앙값이 215를 넘으면서 포화가 5%를 넘을 때, 또는 포화가 30%를 넘을 때입니다. 흰 벽처럼 밝기만 높고 포화가 거의 없는 장면은 밝음으로 둡니다.
- **색온도(CCT)**
  - gray-world 선형 평균과 white-patch(상위 10% 밝기의 저채도 픽셀) 평균을 각각 xy 색도로 바꾼 뒤 McCamy 근사로 CCT를 구합니다.
  - 두 값은 mired 공간에서 6:4로 가중 평균합니다. 두 추정의 차이, 장면 채도, 샘플 수로 신뢰도를 정합니다.
  - 흰 종이를 지정하면 그 지점의 CCT를 쓰고 신뢰도는 0.9로 둡니다.
- **녹색 편향(형광등)**: 평균 색도와 흑체/주광 궤적 사이의 CIE 1960 uv 거리(Duv)를 봅니다. Duv가 +0.006을 넘고 3800K 이상이면 형광등으로 판정합니다.
- **광원 종류**
  - 혼합광이 먼저입니다. 그다음 형광등을 보고, 나머지는 CCT 구간으로 나눕니다: 3300K 미만 백열·전구색, 4300K 미만 온백색, 5300K 미만 주백색 또는 주광, 6800K 미만 주광 또는 주광색, 그 이상은 흐림·그늘 또는 주광색입니다.
  - 주광인지 조명인지는 실내·실외 판정으로 가릅니다.
- **혼합광**: 3×3 타일마다 채도 0.75 미만 픽셀로 CCT를 구합니다. mired 표준편차가 35를 넘고 범위가 90을 넘으면 혼합광입니다.
- **역광**
  - 환경 사진: 235 이상 픽셀이 12%를 넘는데 중앙 영역 중앙값이 110 미만이고 p90의 0.55배 미만이면 역광입니다.
  - 얼굴 사진: 얼굴 밝기가 배경 중앙값의 0.6배 미만이고 배경이 150을 넘으면 역광입니다.
- **실내·실외 점수**
  - 더하는 항목: 상단 1/3의 하늘색 비율 ×2.2, 식물색 ×1.2, CCT 5500K 이상 +0.25
  - 빼는 항목: CCT 4300K 미만 −0.45, 녹색 편향 −0.3
  - 실내 사전 확률로 −0.15를 깔고 시작합니다.
  - 점수가 0.25를 넘으면 실외, −0.15 미만이면 실내, 그 사이는 판단 어려움입니다.
  - AI가 켜져 있으면 판정 신뢰도가 0.6 미만일 때 Claude의 실내·실외 판단으로 보정합니다(`source: 'hybrid'`).
- **경고와 재촬영**
  - error 등급은 재촬영 권장(`retakeRecommended`)으로 이어집니다: 너무 어두움, 과다 노출, 역광.
  - warn 등급: 어두움, 혼합광, 색 캐스트(게인 크기 20 초과), 전구색(3600K 미만), 고대비.
  - 판정 근거는 info 등급 Issue로 저장합니다.
- **조명 품질(`lightingQuality`)**: 경고마다 감점하고 CCT 신뢰도를 곱합니다. 이 값은 피부 신뢰도와 core의 `computeReportConfidence` 입력이 됩니다.
- **흰 종이 기준 백색**
  - 누른 지점 주변 원형 영역의 비포화 픽셀 평균을 씁니다.
  - 밝기 110 이상이어야 하고, 광원 궤적에서 |Duv| 0.02 이내여야 합니다. 유색 물체는 이 조건으로 거부합니다.
  - 채도 기준을 쓰지 않는 이유: 흰 종이는 전구색 아래에서 채도가 높게 나옵니다.

### 2) 촬영 품질 (`src/lib/quality.ts`)

- **yaw/pitch**
  - FaceLandmarker `facialTransformationMatrixes` 회전 성분으로 크기를 구합니다. 행/열 우선 여부와 무관하도록 대칭 성분을 평균합니다.
  - 부호는 랜드마크 근사에서 가져옵니다. roll은 눈꼬리 선 기울기입니다.
- **정면 기준**
  - |yaw| ≤ 8° OK, 12° 초과 오류
  - |pitch| ≤ 10° OK, 15° 초과 오류
  - |roll| ≤ 6° OK, 10° 초과 오류
- **측면 기준**: 모델 |yaw| 35° 미만은 오류, 50° 이상 OK. 35° 미만 측면은 분석에서도 옆선을 만들지 않습니다.
  - 주의: MediaPipe yaw는 큰 각도에서 작게 나옵니다. 육안으로 약 70° 측면인 실사진이 43°로 추정됐습니다.
- **공통 기준**
  - 얼굴 높이 비율: 0.22 미만 오류, 0.3 이상 OK, 0.85 초과 오류. 얼굴이 화면 가장자리에 닿아 잘리면 오류입니다.
  - 얼굴 평균 밝기: 55~225 범위를 벗어나면 오류입니다.
  - 라플라시안 분산 18 미만은 흔들림 경고입니다.
- **실시간 판정**: 연속 3프레임 통과, 그리고 코끝 지터로 계산한 안정성 0.6 초과일 때 셔터가 켜집니다.

### 3) 피부색 (`src/lib/skin.ts`, core `sampleFaceColors`)

- **ROI**
  - 이마, 양 볼, 턱의 랜드마크 볼록 껍질을 씁니다.
  - 눈, 눈썹, 입술은 1.25배 확장해 제외합니다.
  - 셀피 세그멘테이션 마스크(얼굴·몸 피부 카테고리)와 YCbCr 피부 범위의 교집합만 남깁니다.
- **이상치 제거**: ROI별로 휘도 하위 10%(그림자)와 상위 5%(하이라이트)를 자르고, 선형 RGB로 평균합니다.
- **화이트밸런스**: 아래 순서로 첫 번째로 가능한 것을 씁니다.

  | 조건 | 방법 | 보정 강도 |
  |---|---|---|
  | 흰 종이 기준 백색 있음 | 그 기준 백색 게인 | 1.0 |
  | 환경 사진과 얼굴 사진 배경이 모두 있음 | 둘의 gray-world 게인을 기하 평균(`combined`) | 0.6 |
  | 둘 중 하나만 있음 | 그 하나의 gray-world 게인 | 0.6 |

  - 0.6은 gray-world 과보정을 막기 위한 값입니다. 얼굴 사진 배경 게인은 얼굴 박스를 1.3배로 넓힌 영역 밖의 배경 카테고리 픽셀로 계산합니다.
  - 환경 CCT 신뢰도가 0.3 미만이면 강도를 0.4로 낮춥니다.
- **출력**
  - 보정 전/후 `ColorValue`(hex, rgb, Lab, LCh, ITA, 이름)
  - ROI별 값, ROI 간 ΔE2000, 적용 게인과 보정량 ΔE
  - 신뢰도와 근거. core 신뢰도에 조명 품질(0.6+0.4×lq)과 촬영 품질을 반영합니다. 정면 품질 오류는 1건마다 ×0.7입니다(2건이면 0.5 미만). 오류가 있거나 신뢰도가 0.5 미만이면 결과 상단에 "신뢰도가 낮은 결과"를 띄웁니다.
- **부위 색**
  - 헤어: 세그멘테이션 헤어 영역 평균. 마스크가 없으면 이마 위 띠 휴리스틱을 씁니다.
  - 눈동자: 홍채 원판에서 동공과 반사광을 뺍니다.
  - 눈썹, 입술: 각 윤곽 영역 평균입니다.
  - 모두 같은 화이트밸런스를 적용합니다.

### 4) 얼굴 윤곽 (`src/lib/geometry.ts`)

- 눈꼬리 선(33→263)을 수평으로 돌린 얼굴 좌표계에서 비율을 계산합니다. 그래서 기울기와 크기에 영향을 받지 않습니다(테스트로 확인).
- **비율 정의**

  | 비율 | 계산 (랜드마크 번호) |
  |---|---|
  | 길이/광대 폭 | 10–152 / 234–454 |
  | 이마/광대 | 54–284 / 광대 폭 |
  | 턱/광대 | 172–397 / 광대 폭 |
  | 턱끝 각도 | 152에서 136·365 |
  | 3분할 | 10 / 눈썹 중앙 / 2 / 152 |
  | 눈 간격/눈 폭 | (133–362) / (33–133 등 눈 폭) |
  | 코 길이 | 168–2 / 얼굴 길이 |
  | 코 폭 | 129–358 / 눈 간격 |
  | 입 폭 | 61–291 / 코 폭 |
  | 윗/아랫입술 | 0–13 / 14–17 |
  | 좌우 대칭 | 정중선에서 좌우 대응점까지 거리 차 |

- **얼굴형**: 비율 4개(L, F, J, C)를 7개 형별 원형(평균, 표준편차)과 비교한 가우시안 점수로 정합니다. 턱끝 각도는 가중치를 0.5로 둡니다.
  - 원형 값은 경험값입니다. 실사진 2장(계란형 기준 L≈1.19, J≈0.78~0.81)을 기준점으로 삼고, 문헌상 형별 차이를 적용했습니다.
  - 랜드마크 10은 헤어라인보다 아래에 있어서 상안부와 길이 비율이 실제보다 작게 나옵니다. UI에도 이렇게 표시합니다.
- **오버레이**: 윤곽선(FACE_OVAL 36점)과 이목구비 윤곽을 같은 viewBox의 SVG로 사진 위에 그립니다(`AnnotatedPhoto`).

### 5) 측면 옆선 (`src/lib/profile.ts`)

- **옆선**: 정중선 랜드마크 28점(10→152)을 측면 사진 위의 옆선으로 씁니다. 머리 축(10→152)과 얼굴이 향한 방향을 기준 좌표로 삼습니다.
- **실루엣 보정**: 모델 |yaw|가 35° 이상이고 세그멘테이션 마스크가 있으면, 각 점을 같은 높이의 실루엣 경계로 옮깁니다. 이동 폭은 뒤로 3%, 앞으로 5%까지입니다.
- **E-라인**
  - 코끝(5·4·1·19·94 중 가장 앞)과 턱끝(18·200·199·175·152 중 가장 앞)을 잇는 선입니다.
  - 윗입술(0)과 아랫입술(17)의 부호 있는 수직 거리를 얼굴 길이 대비로 냅니다. 앞쪽이 +입니다.
  - ±1.2%를 기준으로 앞으로 나옴 / 근접 / 안쪽으로 나눕니다.
- **측면 볼록도**: 미간(9)–코밑(2)–턱끝 각의 편차로 나눕니다. 18° 이상은 볼록형, 6° 이상은 직선형, 그 미만은 오목형입니다. 연조직 G–Sn–Pog′ 기준 약 12±4°를 참고했습니다.
- **코 돌출**: 비근(168)에서 코끝까지의 앞쪽 거리를 얼굴 길이 대비로 냅니다.
- **각도 보정을 하지 않는 이유**: 완전 측면이 아니면 앞뒤 거리가 작게 측정됩니다. 그런데 MediaPipe yaw가 큰 각도에서 작게 나와서 1/sin(yaw) 보정은 오히려 과대 보정이 됩니다.

### 6) AI 보조 분석 (선택)

- **호출 방식**: `@celeber/core/server/ai`의 `callVisionStructured`를 씁니다. 내부적으로 `claude-opus-5-5`, `client.beta.messages.parse`, zod 구조화 출력, effort low, server-side fallbacks를 사용합니다.
- **환경 사진**: 실내·실외, 주된 광원, 피부색 촬영에 영향을 줄 요소를 묻습니다. 결과는 `aiNotes`에 넣고, 신뢰도가 낮을 때는 실내·실외 판정도 보정합니다.
- **얼굴 사진**(정면과 측면): 헤어스타일, 헤어 색, 이목구비 관찰 3~5개, 인상, 조명 영향, `presentation`을 묻습니다.
  - `presentation`은 스타일 표현 기준의 리포트 변형 기본값입니다. 성별이나 신원 판단이 아니며, 애매하면 `unspecified`입니다.
- **신원 판단 금지**: 측정값을 프롬프트에 넣어 모순되지 않게 서술하도록 합니다. `IDENTITY_POLICY`가 자동으로 붙어 얼굴로 신원을 판단하지 않습니다.

## Mock 동작

- **AI 서술이 Mock이 되는 경우**: 키 없음, `CELEBER_FORCE_MOCK=1`, 사용 한도 초과(현재 `.env` 키 상태), 호출 실패.
- **Mock일 때의 결과**
  - 환경은 규칙 기반 결과만 냅니다(`aiSource: 'mock'`).
  - 얼굴 서술은 측정값만으로 만든 결정적 템플릿(`ruleBasedDescription`)입니다. `presentation`은 `unspecified`입니다.
- **표시**
  - `analysis.isMock = true`가 되고, 서술 카드에 "데모 데이터" 배지를 붙입니다.
  - 상세 화면 상단에 "측정값은 실제 사진 기반"이라는 안내를 띄웁니다.
  - 피부색, 윤곽, 환경 수치는 Mock과 상관없이 항상 실제 사진에서 계산합니다.
- **`source` 값**: `rules`(AI 없음) 또는 `hybrid`(AI 서술 포함)입니다.

## 후행 PoC에서 쓰기

`package.json`의 exports:

| 경로 | 내용 |
|---|---|
| `@celeber/camera-face/flow` | `FaceCaptureFlow`, 훅, 캡처 유틸 (`'use client'`) |
| `@celeber/camera-face/components` | `FaceAnalysisView`, `AnnotatedPhoto`, `EnvironmentSummary`, `FaceSessionList` |
| `@celeber/camera-face/lib` | 순수 함수와 API zod 스키마, `POC_INFO`, `drapeAnchorFromAnalysis` |
| `@celeber/camera-face/server` | `server-only`. DB와 AI 서버 함수 |
| `@celeber/camera-face/routes` | `server-only`. Route Handler 함수 |

호스트 앱(예: personal-color-report)은 아래 경로를 재노출해야 플로우가 동작합니다.

| 파일 | 내용 |
|---|---|
| `app/api/face/environment/route.ts` | `export { environmentPOST as POST } from '@celeber/camera-face/routes'` |
| `app/api/face/analyze/route.ts` | `export { analyzePOST as POST } from '@celeber/camera-face/routes'` |
| `app/api/face/sessions/route.ts` | `export { sessionsGET as GET, sessionsDELETE as DELETE } from '@celeber/camera-face/routes'` |
| `app/api/face/sessions/[id]/route.ts` | `export { sessionGET as GET, sessionDELETE as DELETE } from '@celeber/camera-face/routes'` |
| `app/api/face/latest/route.ts` | `export { latestGET as GET } from '@celeber/camera-face/routes'` |

- 각 파일에 `export const runtime = 'nodejs'`와 `export const dynamic = 'force-dynamic'`를 함께 둡니다.
- `/api/uploads`는 기반 단계에서 모든 앱에 이미 있습니다.

```tsx
'use client';
import { FaceCaptureFlow } from '@celeber/camera-face/flow';
<FaceCaptureFlow steps={['환경', '정면', '측면', '전신(선택)']} onComplete={({ sessionId, analysis }) => { /* analysis: FaceAnalysis */ }} />
```

## 한계

- **스마트폰 자동 화이트밸런스**: 사진에 이미 적용돼 있어서 환경 CCT는 "보정 후 남은 색 치우침"에 가깝습니다. 절대 광원 CCT로 읽으면 안 됩니다. 흰 종이 기준을 쓰면 가장 정확합니다.
- **gray-world**: 단색 벽이나 원색 배경에서는 틀릴 수 있습니다. 그래서 강도를 0.6으로 두고 신뢰도에 반영합니다.
- **경험값**: 얼굴형 원형, 측면 볼록도와 E-라인 기준은 경험값이며 실측 데이터로 튜닝하지 않았습니다. 랜드마크 10은 헤어라인이 아닙니다.
- **측면 검출**: MediaPipe FaceLandmarker는 완전 측면(90°)에서 얼굴을 놓치는 경우가 있습니다. 측면이 미검출이면 사진만 저장하고 옆선 분석은 생략하며, 경고를 남깁니다.
- **HEIC**: 브라우저가 디코딩하지 못하면 실패할 수 있습니다. iOS Safari는 보통 JPEG로 변환해 줍니다.
- **테스트 픽스처**: `test/fixtures/landmarks.json`은 참고 이미지 3장(`docs/ui`)에서 브라우저 MediaPipe로 추출한 랜드마크 좌표만 담고 있습니다. 이미지는 포함하지 않습니다.
