# personal-color-report — 내 얼굴과 전신(선택)에서 퍼스널컬러 추출

얼굴 분석(camera-face)과 전신 비율(camera-body, 선택)로 퍼스널컬러를 판정하고 리포트를 만든다. 리포트는 [레퍼런스 카드](../../docs/ui/personal-color-report-guide/navy-men-personal-color-report-card.jpeg)와 섹션 구조가 같다. 390pt 모바일에서는 세로 스크롤로 배치했다.

- 포트: 3105. API 네임스페이스는 `/api/report/*`다.
- 선행 PoC를 재노출한다. `/api/face/*`는 camera-face, `/api/body/*`는 camera-body의 Route Handler다.

## 실행

```bash
cd /Users/jyl/work/repo/celeber
pnpm --filter @celeber/personal-color-report dev      # http://localhost:3105
pnpm --filter @celeber/personal-color-report build && pnpm --filter @celeber/personal-color-report start
pnpm --filter @celeber/personal-color-report test     # vitest
CELEBER_FORCE_MOCK=1 pnpm --filter @celeber/personal-color-report dev   # AI 없이 처음부터 Mock 경로
```

## 화면 흐름

| 경로 | 내용 |
|---|---|
| `/` | 소개, `리포트 만들기`, 최근 리포트 5개 |
| `/new` | 입력 방법을 고른다: **새로 촬영**(환경→정면→측면→전신(선택)) 또는 **저장된 얼굴 분석 선택** + 전신 세션(선택 / 전신 없이 / 새 전신). 다음 화면 `진단 준비`에서 리포트 스타일(남성/여성/선택 안 함)을 고른다. 기본값은 사진 기반 `FaceAnalysis.ai.presentation`이다. 그다음 생성하면 `/reports/<id>`로 이동한다 |
| `/new?step=capture` | 바로 촬영. camera-face `FaceCaptureFlow` 다음에 camera-body `BodyCaptureFlow`(4/4 전신, 건너뛰기 가능)가 이어진다 |
| `/new?face=<id>&step=body` | 리포트의 `전신 사진 추가`에서 들어온다. 얼굴은 고정하고 전신부터 시작한다 |
| `/reports` | 리포트 목록. `리포트 전체 초기화`는 ConfirmDialog를 거친다. personal_color_reports만 지우고 얼굴·전신 분석과 사진은 남긴다 |
| `/reports/<id>` | 리포트 다시보기. 스타일 변형을 바꾸면 PATCH로 저장된다. `같은 얼굴로 다시 만들기`, 삭제(확인 단계) |

모든 카메라 단계에는 업로드 대체 경로가 있다. 선행 플로우가 제공한다.

## 리포트 구성 (카드 → 구현)

| 카드 | 구현 |
|---|---|
| 헤더 | 제목(`남성/여성/` + `퍼스널컬러 분석 리포트`), 한 줄 설명, 메타 박스(분석일 / 분석기반 / 분석도구). Mock이면 `데모 데이터` 배지 |
| 업로드한 사진 | 큰 정면 사진(`업로드한 사진` 라벨). 측면·전신·환경 사진이 있으면 작은 썸네일 |
| ① 첫인상 브리핑 | 체크 bullet 4개 + 해시태그 칩 |
| ② 퍼스널컬러 타입 | 타입 대표색 강조 블록(한글명 / 영문명), 설명 2~3줄, `보조 가능 타입`(2위 톤), 12톤 적합도 상위 3 막대, AI 독립 판정(있을 때) |
| ③ 웜톤 vs 쿨톤 | 웜/쿨 가능성 %(합 100), 각 그라데이션 바 + ▲ 마커, `분석 포인트` 박스(측정 색상각·b* 인용), 웜 계열/쿨 계열 색 견본 + 한 줄 비교 |
| ④ 주요 특징 | 아이콘+항목+값 표(피부톤/명도/채도/청탁감/대비감/이미지 키워드). 대비감은 카드처럼 '이 타입의 권장 코디 대비'를 앞에, 측정 ΔL*를 뒤에 쓴다(예: `낮음~중간 (과한 대비 비추천) · 측정 피부·헤어 명도 차 ΔL* 84`). 5축 막대(웜·명도·채도·대비·청탁)에는 내 측정값과 판정 타입 기준점을 함께 찍는다, 측정한 색(피부 보정 전·후, 헤어, 눈동자, 입술) + Lab·ITA·색상각 |
| ⑤ 톤 컬러 적용 예시 | 정면 사진에 턱 아래 천을 **canvas로 합성**. 위에는 베스트 vs 워스트 큰 비교, 아래에는 `잘 어울리는 톤` 4 / `어울리지 않는 톤` 4 썸네일 + 색 이름 + 행 설명. 썸네일을 탭하면 큰 비교가 바뀐다 |
| ⑥ 추천 셔츠(상의) | 셔츠/블라우스/니트 형태 스와치 6 + TIP |
| ⑦ 추천 수트(아우터·하의) | 원단 사각 스와치 5 + TIP |
| ⑧ 넥타이(스카프) & 악세서리 | 포인트 컬러(넥타이/스카프/원형) 4, 금속색으로 칠한 악세서리 아이콘 3(남성 시계 3 / 여성 귀걸이·목걸이·반지), 금속 톤 요약 |
| ⑨ 추천 헤어 | 헤어 스와치 4(이름 + 한 줄 설명), 소개, TIP(피할 컬러) |
| ⑩ 그루밍 | 아이콘+항목+제안. 남성: 피부/눈썹/수염/향수, 여성: 베이스/립/아이/치크(색 점 포함), 선택 안 함: 피부/눈썹/헤어 스타일링/향수 (`appGroomingTemplate`) |
| ⑪ 비추천 스타일 | 재킷/셔츠 일러스트 스와치 4 + 한 줄 이유 + 소개 |
| 전신 | 전신이 있으면 `체형 비율 코디 실루엣`(체형·등신, 제안, 피할 실루엣). 없으면 camera-body `BodyAddPlaceholder`(`전신 사진 추가`) |
| 12 오늘 바로 적용할 포인트 | 체크 4 |
| 13 정확도 주의사항 | 클립보드 아이콘 + 조명·카메라·모니터 안내. 이번 촬영의 경고(과노출 등)도 덧붙인다 |
| 14 분석 신뢰도 | 원형 게이지 % + 등급 + 요인별 막대와 근거. 등급이 낮으면 ② 아래에 재촬영 안내 |
| 면책 | 하단 문구 |

성별/스타일 변형은 `applyVariant`가 처리한다. ⑥⑦⑧⑩의 제목·형태·항목과 헤더 제목만 바꾸고, 퍼스널컬러 판정과 섹션 구조는 그대로 둔다.

## 알고리즘과 근거

1. **입력**
   - camera-face가 저장한 `FaceAnalysis`를 쓴다. 화이트밸런스 보정한 피부 Lab, ROI별 편차, 헤어/눈 Lab, 환경(광원·CCT·lightingQuality), 정면 랜드마크가 들어 있다.
   - 서버는 face_sessions와 body_sessions에서 다시 읽는다. 클라이언트가 보낸 측정값은 믿지 않는다.
2. **판정** — `classifyFace` → core `classifyPersonalColor`. 결정적이다.
   - 5축: 웜(색상각·b*), 명도(L*), 채도(C*), 대비(피부-헤어/눈 ΔL*), 청탁.
   - 12톤 원형과의 가중 거리를 softmax로 바꿔 1위를 판정, 2위를 보조 타입으로 삼는다.
   - **앱 단 보정**(core로 승격 후보):
     - camera-face의 헤어 L*는 그늘 픽셀 때문에 2~10으로 매우 낮게 나온다. core 기본값(ΔL* 18→0, 62→1)으로는 밝은 피부 + 검은 머리가 모두 대비 100이 된다.
     - 그 결과 L* 86 피부가 겨울 딥과 거의 동점이었다(margin 0.004).
     - 대비 범위를 ΔL* 35→0, 85→1로 넓히고 헤어/눈 L* 하한을 8로 두었다. 웜/쿨 판단은 그대로다. 같은 입력이 여름 뮤트(보조 여름 라이트, margin 0.13)가 된다.
     - 테스트로 고정했다.
3. **서술** — Claude(`callVisionStructured`, 구조화 출력, 얕은 zod 스키마 `AiNarrativeSchema`)에게 아래를 보낸다.
   - 입력: 정면 사진 + 측정값 + 규칙 판정.
   - 출력:
     - (1) 규칙과 독립적인 톤 의견(`independentTone`)
     - (2) 규칙 톤 기준 서술: 첫인상, 설명, 분석 포인트, 특징 값, TIP, 그루밍, 오늘 포인트
   - 빈 값은 템플릿으로 채운다(`mergeAiNarrative`).
   - 키가 없거나 실패하면 `templateNarrative`를 쓴다. 템플릿도 측정 색상각·b*·ITA·ΔL*를 문장에 넣는다.
4. **조립** — `assembleReport`. 카드 섹션에 1:1로 채우고 `PersonalColorReportSchema.parse`로 검증한 뒤 저장한다.
5. **드레이핑**
   - 크롭: `drapeCrop`가 같은 정면 사진에서 얼굴 위 22%부터 턱 아래 60%까지 잡는다. 사진이 턱 바로 아래에서 끝나면 35%까지만 잡는다.
   - 천 윤곽: `drapeOutline`이 어깨 → 목 옆 → 턱 아래 곡선을 만든다. 모든 점이 턱끝보다 아래라 얼굴을 가리지 않는다.
   - 그리기: `DrapeThumb`가 천 색 바탕, 목에 드리우는 그림자, 주름 음영을 그리고, 목에 비치는 반사광을 턱선 아래에만 soft-light(알파 0.12)로 더한다. 얼굴(턱선 위) 픽셀은 모든 색에서 같다 — 390px Chrome에서 베스트/워스트 캔버스의 위쪽 55% 픽셀 차이 0으로 확인.
   - 사진 밖 영역은 가장자리 픽셀로 채운다.
   - 색만 바꾸고 조명·구도는 원본 그대로다.
   - `harmony`는 추천 팔레트와 워스트 팔레트까지의 ΔE2000 차이를 시그모이드로 바꾼 값이다.
6. **신뢰도(⑭)** — `reportConfidence` → core `computeReportConfidence`. 고정값은 없다. 입력은 다음과 같다.
   - 환경 lightingQuality
   - 화이트밸런스 보정량 ΔE
   - 정면 검출 점수(품질 미통과 시 ×0.8)
   - 피부 ROI 편차 ΔE
   - 분류 margin
   - 규칙·AI 일치도(톤 일치 / 계절만 일치 / 불일치 / AI 없음이면 제외)
   - 헤어·눈 측정 여부

   요인별 근거에는 실제 값(광원·K·밝기, 검출 %, 1·2위 차)을 넣는다.

   앱 단 감점(`unreliableCapture`): 색이 강한 조명(백열·전구색 LED·형광·혼합, 3,800K 미만/8,000K 초과, 조명 품질 0.45 미만)에서 피부 부위 편차 ΔE가 15를 넘으면 점수 ×0.7(최대 49) → 항상 '낮은 신뢰도 · 재촬영 권장'. 13 주의사항 맨 앞과 ② 아래에 재촬영 안내를 넣는다. 분류 margin이 커서 확신이 높아 보여도 조명 때문에 웜/쿨이 뒤집혔을 수 있기 때문이다.
7. **전신** — camera-body `toBodyStyling`(체형·등신 → 실루엣 제안/회피)을 그대로 쓴다. 측정이 완료된 세션만 연결한다.

## API (`/api/report/*`)

| 메서드 | 경로 | 내용 |
|---|---|---|
| POST | `/api/report/generate` | `{faceSessionId, bodySessionId?: string\|null, gender?: 'male'\|'female'\|'unspecified', skipAi?}` → `{report, aiSource: 'ai'\|'mock'\|'skipped', warning?}`. 결과는 personal_color_reports에 저장된다. 응답 코드: 400 검증 오류, 404 `face_not_found`/`body_not_found`, 409 `face_incomplete` |
| GET | `/api/report/inputs` | `{face: InputFace[], body: InputBody[]}`. 완료된 얼굴 세션(+presentation)과 측정 완료 전신 세션 |
| GET | `/api/report/reports?limit=` | `{reports: PersonalColorReportSummary[]}` |
| DELETE | `/api/report/reports?confirm=1` | 전체 삭제(이 테이블만). confirm이 없으면 400 |
| GET | `/api/report/reports/<id>` | 리포트. 없으면 404 |
| PATCH | `/api/report/reports/<id>` | `{gender}` → 변형을 바꾼 리포트(`variant.userSelected=true`) |
| DELETE | `/api/report/reports/<id>` | 삭제 |
| GET | `/api/report/latest` | 최근 리포트 |

재노출하는 선행 PoC 라우트:
- `/api/face/{environment, analyze, sessions(GET), sessions/[id](GET), latest}`
- `/api/body/{analyze, sessions(GET), sessions/[id](GET), demo}` — 선행 PoC 세션의 DELETE는 재노출하지 않는다(삭제는 각 PoC 앱에서).
- 공통: `/api/health`, `/api/meta`, `/api/uploads`, `/api/uploads/[id]`

## Mock 동작

키가 없거나, `CELEBER_FORCE_MOCK=1`이거나, 사용 한도 초과로 AI가 차단됐거나, 호출이 실패하면 서술은 결정적 템플릿이 된다. 이때 리포트 값은 `source='rules'`, `isMock=true`다.
- 리포트 헤더에 `데모 데이터` 배지를 붙이고 상세 페이지 상단에 안내를 표시한다.
- 피부색 측정, 12톤 판정, 웜/쿨 %, 축, 드레이핑 합성, 신뢰도는 Mock 여부와 상관없이 실제 사진에서 계산한다.
- `skipAi=true`면 AI 단계를 일부러 건너뛴다(`aiSource='skipped'`, `isMock=false`).
- AI가 성공하면 `source='hybrid'`다. `aiOpinion`이 신뢰도의 규칙·AI 일치도에 반영되고 ②에 표시된다.
- AI 서술은 `kv`의 `pcr:narrative:<id>`에도 저장한다. 그래서 변형을 바꿨다가 같은 성별로 돌아오면 AI 그루밍·오늘 포인트를 다시 쓴다. 다른 성별에서는 그 성별의 템플릿을 쓰고, 리포트 상단 스타일 선택 아래에 'AI 서술은 만들 때의 스타일 기준이며 지금 섹션은 템플릿'이라는 안내를 띄운다(`variantUsesTemplateNarrative`).

## 재사용 export (후행 celeb-vibe-report)

```ts
// 서버 (route handler / server component)
import { generatePersonalColorReport, getReport, getLatestReport, listReports, updateReportVariant, deleteReport, listReportInputs } from '@celeber/personal-color-report/server';
// Route Handler 재노출 (호스트 app/api/report/generate/route.ts 등)
export { generatePOST as POST } from '@celeber/personal-color-report/routes';   // + runtime='nodejs', dynamic='force-dynamic'
// 리포트 뷰 ('use client')
import { PersonalColorReportView, ReportList, DrapeThumb } from '@celeber/personal-color-report/components';
// 입력 플로우 / 다시보기 ('use client')
import { PersonalColorReportFlow, ReportViewer, generateReport } from '@celeber/personal-color-report/flow';
// 순수 함수·팔레트 데이터
import { paletteFromReport, paletteForTone, substituteToPalette, METAL_HEX, classifyMeasured, assembleReport, applyVariant } from '@celeber/personal-color-report/lib';
```

## 테스트

`test/ai-path.test.ts`(2)는 `callVisionStructured`를 'ai' 결과로 대체해(외부 호출 없음) AI 성공 경로를 검사한다: hybrid source, aiOpinion, 규칙·AI 일치도 요인(일치 1 / 다른 계절 0.25 → 점수 하락), AI 서술 병합, 정면 사진 첨부, 변형 전환 시 템플릿 안내와 원래 스타일 복원.

`test/report.test.ts`(21)는 순수 로직을 검사한다.
- 보정 분류
- 조립(섹션 1..14, 항목 수, 라벨)
- 드레이핑 조화도
- Mock/AI 출처
- 신뢰도가 측정에 따라 변하는지
- 성별 변형 왕복
- 드레이핑 크롭과 천 윤곽(얼굴 미침범)
- 팔레트 치환
- 서술 병합
- 대비감 문구(타입 권장 + 측정), '선택 안 함' 그루밍, 조명 불량 신뢰도 감점·재촬영 안내

`test/routes.test.ts`(4)는 임시 DB와 FORCE_MOCK으로 라우트를 통합 검사한다.
- 생성(전신 포함)
- 목록, 상세, PATCH, latest, 삭제
- 사용자 선택 성별
- skipAi
- 오류 경로

픽스처 `test/fixtures/face-analysis.json`은 camera-face 데모 세션의 실제 분석 결과다.

## 한계

- **AI 경로 미검증:** AI 서술은 실제 응답으로 검증하지 못했다. 루트 키가 2026-12-01까지 사용 한도 초과다. 확인한 것은 요청 생성(스키마 변환 포함), 400 수신, Mock 폴백까지다.
- **분류기는 경험값이다:** 분류기 원형과 앱 보정값은 실측 데이터로 튜닝하지 않았다. 웜 % 시그모이드는 급하다. 검은 머리에서는 측정 대비가 여전히 중간 이상으로 나오기 쉽다. ④에서는 타입 권장 대비를 앞세우고 측정값은 근거로만 보여 표와 타입 판정이 어긋나지 않게 했다.
- **드레이핑은 시뮬레이션이다:** 반사광은 약한 근사이고 실제 천 반사를 측정한 것이 아니다. 랜드마크 턱끝이 실제보다 약간 아래로 잡히면 천 위쪽이 턱선에 닿아 보일 수 있다.
- **성별 변형은 스타일 표현 기준이다:** 사진 기반 기본값(`presentation`)은 AI가 있을 때만 채워진다. 키가 없으면 `unspecified`다. 신원이나 생물학적 판단이 아니며 사용자가 언제든 바꿀 수 있다.
- **세션 삭제 시 동작:** 리포트는 얼굴/전신 세션을 id로 참조한다. 세션이 지워져도 리포트는 그대로 보이고, `전신 사진 추가` 링크는 `/new`로 바뀐다.
- **레이아웃 Mock 배지:** floating 배지가 화면 오른쪽 아래를 가릴 수 있다. 이 앱에서는 `pointer-events: none`으로 터치를 통과시키고, 카메라 화면에서는 숨긴다.
