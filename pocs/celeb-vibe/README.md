# celeb-vibe: 연예인 추구미 추출 PoC (포트 3104)

이 PoC는 사진 한 장에서 연예인의 추구미를 뽑아 SQLite에 기록한다. 추구미는 세 가지로 나눈다.

- **코디**: 아이템별 종류, 색(hex와 이름), 소재, 핏, 사진 위 위치
- **퍼스널컬러**: 피부·헤어·눈동자 색, 추정 톤, 근거와 신뢰도, 조명 한계
- **분위기**: 무드 키워드, 첫인상, 이미지 레퍼런스, 주조·보조·포인트 팔레트

결과는 후행 PoC인 `celeb-vibe-report`가 재사용한다. 이 PoC는 사진 속 인물이 누구인지 판단하지 않는다. 사용자가 입력하거나 search-celeb에서 넘어온 이름은 메타데이터로만 저장한다.

## 실행

```bash
cd /Users/jyl/work/repo/celeber
pnpm --filter @celeber/celeb-vibe dev        # http://localhost:3104
pnpm --filter @celeber/celeb-vibe build && pnpm --filter @celeber/celeb-vibe start
pnpm --filter @celeber/celeb-vibe test       # vitest 61개
pnpm --filter @celeber/celeb-vibe lint
pnpm --filter @celeber/celeb-vibe typecheck
CELEBER_FORCE_MOCK=1 pnpm --filter @celeber/celeb-vibe dev   # AI 키가 있어도 Mock으로 실행
```

- 환경변수는 루트 `.env`에서 읽는다. `ANTHROPIC_API_KEY`가 없으면 `CLAUDE_API_KEY`를 대신 쓴다. 모델은 `CELEBER_VISION_MODEL`이고 기본값은 `claude-opus-5-5`다.
- 데이터는 `pocs/.data/celeber.db`와 `pocs/.data/uploads`에 저장한다. 모든 PoC가 이 경로를 공유한다.

## 화면 흐름

| 경로 | 역할 |
|---|---|
| `/` | 새 분석 화면. 아래 3단계를 진행하고 끝나면 상세 화면으로 이동한다. 하단에 최근 분석 3건을 보여준다. |
| `/analyses` | 추구미 기록 목록. 각 행은 썸네일, 이름, 룩 이름, 팔레트, 톤 순서로 보인다. 목록 화면에서 기록을 초기화할 수 있다. |
| `/analyses/[id]` | 결과 상세. 이름과 룩 이름 수정, 다시 분석, 삭제를 할 수 있다. 삭제는 확인 단계를 거친다. |

새 분석은 세 단계로 진행한다.

1. **사진 선택.** 인물 이름(선택)을 입력하고 아래 네 방법 중 하나로 사진을 가져온다. 업로드와 저장 사진은 JPEG·PNG·WebP만 받는다. 업로드 상한은 25MB이고, proxy 본문 상한(`next.config.ts proxyClientMaxBodySize`, 기본 10MB)을 40MB로 올려 두었다.
   - 업로드
   - 카메라: 어두운 촬영 바탕, 한 줄 지시, 고정 셔터, 프레임 가이드로 구성한다. 업로드 대체 경로와 전면·후면 전환이 있다.
   - 이미지 주소(URL): SSRF 방어가 적용된다.
   - search-celeb가 저장한 연예인 사진
2. **분석 가능 여부.** 사진을 유지한 채 그 위에 측정 진행 상태를 겹쳐 보여준다. 측정이 끝나면 판정 한 줄, 코디·퍼스널컬러·분위기 가능 여부, 사유를 짧게 보여준다.
   - 분석 가능: `추구미 분석하기`
   - 분석 불가: `다른 사진 고르기` 또는 `그래도 분석하기`
   - 여러 명이 나온 사진: `가장 큰 인물 기준으로 분석`
3. **분석.** AI 분석 중에도 사진을 유지한다. 저장한 뒤 상세 화면으로 이동한다.

결과 화면은 사진 → 관찰한 특징 → 적용 순서로 읽힌다.

- **사진:** 아이템 핫스팟을 번호 점과 선택 영역 테두리로 표시하고, 바로 아래에 원형 팔레트 견본을 둔다.
- **분석 가능성 요약**
- **① 코디:** 아이템 행을 누르면 사진의 해당 영역이 강조된다. 스타일 키워드, 실루엣, 요약을 함께 보여준다.
- **② 퍼스널컬러:** 다음 항목을 차례로 보여준다.
  - 톤 블록
  - 피부·헤어·눈 견본
  - 신뢰도 게이지
  - 웜쿨·명도·채도·대비·청탁 축
  - 근거
  - 조명 한계
- **③ 분위기**
- **④ 팔레트:** 주조·보조·포인트
- **(전신일 때) 사진 속 체형 비율**

결과마다 `isMock`이면 `데모 데이터` 배지를 붙이고, AI 폴백 사유가 있으면 경고 박스로 보여준다.

## 알고리즘

### 1. 브라우저 측정 (`src/flow/measure.ts`, MediaPipe, 로컬 wasm과 모델)

사진을 긴 변 1024px로 줄인 뒤 아래 순서로 측정한다.

1. **장면 통계** (`lib/stats.ts sceneStats`)
   - 평균 밝기, 클리핑 비율, 평균 채도를 구한다.
   - 무채색 픽셀이 97%를 넘으면 흑백으로 본다.
   - gray-world 게인과 게인 기반 장면 색온도(K)를 구한다.
2. **셀피 멀티클래스 세그멘터.** 헤어(1) 마스크와 옷(4)·기타(5) 마스크를 만든다.
3. **FaceLandmarker 478점** (최대 4명)
   - 가장 큰 얼굴에 `core/face sampleFaceColors`를 적용한다. 피부는 이마·양 볼·턱 ROI의 robust 평균이고, 헤어는 세그멘테이션, 눈동자는 홍채 원판, 입술도 함께 구한다.
   - ROI 간 ΔE2000 편차를 구한다.
4. **PoseLandmarker 33점** (최대 3명)
   - **인물 수:** 가장 큰 사람 면적의 15% 이상인 사람만 센다.
   - **프레이밍:** 발목까지 보이면 전신, 골반이나 어깨까지면 상반신이다.
   - **의상 영역 다각형** (`lib/pose.ts outfitRegions`)
     - 몸통 가운데 띠: 이너·상의
     - 몸통 양옆 띠와 상완: 소매·아우터
     - 골반→무릎→발목의 굵은 선분: 하의
     - 발목·뒤꿈치·발끝 주변: 신발
   - 영역마다 옷 마스크 픽셀을 우선 쓴다. 옷 픽셀이 부족하면 피부색이 아닌 픽셀을 쓴다. 대표색은 Lab 공간의 결정적 k-means(k=3, k-means++ 시드 고정, ΔE<7 병합)로 구한다.
   - **체형 비율:** 등신, 상하체 비, 다리/키, 어깨/골반 관절 폭 비를 구한다. 머리 높이는 얼굴 상자 높이 × 1.35로 잡고, 얼굴이 없으면 코→어깨선 수직 거리 × 1.15로 잡는다.
5. **얼굴 재검출.** 전신 사진처럼 얼굴이 작아 3단계에서 실패하면, 포즈의 코·어깨 위치로 머리 영역을 원본 해상도에서 잘라 256~512px로 키운다. 그 영역에서 FaceLandmarker와 세그멘터를 다시 실행한다. e2e에서 368×428 전신 사진(얼굴 35px)의 피부·헤어·눈을 이 방법으로 측정했다.
6. **얼굴 위주 사진.** 몸통 영역이 없으면 턱 아래 영역을 상의로 본다.

### 2. 분석 가능성 규칙 (`lib/analyzability.ts`)

아래 조건마다 사유 코드와 한 줄 메시지를 남긴다. `error` 사유가 하나라도 있으면 분석 불가로 본다.

| 사유 | 조건 | 결과 |
|---|---|---|
| 인물 없음 | 얼굴과 포즈 검출기가 정상 실행됐는데 둘 다 0 | `error`. 사용자가 강행하면 `warn`으로 낮추고 서버 통계로 분석한다 |
| 측정 불가 | 얼굴/포즈 검출기 실행 실패(모델 로드 실패·미지원 브라우저)이고 인물 0 | 측정값을 버리고 서버 통계로 판정한다(`other` `warn`). '인물 없음'으로 막지 않는다 |
| 여러 명 | 인물이 2명 이상 | `error`. 사용자가 강행하면 `warn`으로 낮춘다(AI 판정과 병합한 뒤에도 유지) |
| 역광 | 얼굴 밝기 / 장면 밝기 < 0.62, 장면 밝기 > 110 | 퍼스널컬러 불가 |
| 얼굴 작음 | 원본 기준 얼굴 높이 < 72px | 퍼스널컬러 불가 |
| 저해상도 | 짧은 변 < 360px | 퍼스널컬러 불가 |
| 강한 필터 | 흑백 | `error` |
| 강한 필터 | 평균 채도 ≥ 0.52 | 퍼스널컬러 불가 |
| 극단적 조명 | 평균 밝기 < 42 또는 > 228, 하이라이트 클리핑 > 22%, 섀도 클리핑 > 35% | 퍼스널컬러 불가 |
| 가림 | 포즈상 머리는 보이는데 얼굴 랜드마크가 없음 | 퍼스널컬러 불가 |
| 잘림 | 상반신·얼굴 위주 사진 | `info`. 하의·신발이 분석에서 빠진다 |
| 일러스트 | AI만 판정한다 | `error` |

AI 판정은 사유를 추가할 수 있다. 부분 가능 여부(코디·퍼스널컬러·분위기)는 규칙과 AI가 모두 가능이라고 판정해야 가능이 된다. 브라우저 측정이 있으면 인물 수는 측정값을 우선한다.

- 브라우저 측정 없이(서버 통계만) 판정하면 얼굴을 직접 측정하지 않았으므로 퍼스널컬러는 참고용(`partial.personalColor=false`)으로 표시한다. AI가 사진을 직접 보면 사진 조건 사유(역광·저해상도·필터·극단 조명)가 없을 때 AI 판단을 따른다.
- 측정값을 믿을지는 `resolveMeasurement`가 정한다. 측정값의 `detectors`(face/pose/segmentation: ok·failed·skipped)로 '검출 0건'과 '검출기 실패'를 구분한다.
- 클라이언트 측정값은 zod로 엄격히 검증한다(hex `#RRGGBB`, RGB 0..255, 배열 길이 상한 `MEASUREMENT_LIMITS`). 형식이 틀리면 400 `invalid_measurement`.

### 3. 규칙 초안 (`lib/rules.ts`, `lib/build.ts buildRuleDraft`)

- **아우터 판별:** 몸통 가운데 색과 양옆·소매 색의 ΔE2000이 14를 넘으면 앞이 열린 아우터와 이너 상의로 나눈다.
- **팔레트**
  - 주조: 의상 클러스터 중 면적이 가장 큰 1~2색
  - 보조: 그다음 색
  - 포인트: 남은 색 중 채도 C* ≥ 22인 소면적 색. 없으면 측정한 입술색을 쓴다.
- **스타일 키워드:** 팔레트의 성질로 정한다. 네이비+화이트 → 클래식, 저채도 → 미니멀, 어둡고 저채도 → 시크, 어스톤 → 내추럴, 파스텔 → 로맨틱, 고채도 → 스트릿, 명도 차가 크면 모던이다.
- **분위기:** 스타일 키워드에서 무드 단어, 레퍼런스, 첫인상 문장을 결정적으로 매핑한다.
- **퍼스널컬러**
  - 장면 gray-world 게인을 40% 강도로만 보정한다. 셀럽 사진은 배경색의 영향이 크기 때문이다.
  - 보정한 피부·헤어·눈 Lab을 `core classifyPersonalColor`에 넣어 12톤, 축, margin을 얻는다.
- **신뢰도** (`vibeColorConfidence`, 고정값 없음)
  - 측정했으면 0.5에서 시작한다. 측정하지 않고 AI만 판단했으면 0.3 + 0.25 × AI 확신도에서 시작한다.
  - 샘플 픽셀 수, 얼굴 해상도, 피부 밝기 편차, 부위별 ΔE, 헤어·눈 측정 여부, 분류 margin으로 가감한다.
  - 규칙 톤과 AI 톤이 같으면 +0.10, 계절만 같으면 +0.04, 다르면 −0.10이다.
  - 사진 조건이 나쁘면 상한을 0.3으로 둔다. 셀럽 사진 전체의 상한은 0.85다.
- **흑백 사진:** 톤을 추정하지 않는다.
- **톤과 언더톤이 엇갈릴 때:** 웜 계절인데 언더톤이 쿨로 읽히는 식이면 언더톤은 '판정 보류'로 두고 신뢰도를 0.1 낮춘다(`reconcileUndertone`).
- **노출 부족:** 아주 어두운 사진은 사유 문구와 각 아이템 노트에 '실제보다 어둡게 측정됐을 수 있다'고 적는다.
- **투명 PNG:** 알파 128 미만 픽셀은 장면·영역 통계에서 뺀다. 반투명 픽셀은 흰 배경에 합성한다.
- **종류·소재·핏:** 픽셀로 알 수 없으므로 규칙 초안에서는 비워 둔다. 지어내지 않는다.

### 4. Claude 비전 (`lib/ai-schema.ts`, `server/index.ts analyzeVibe`)

- **호출:** `core callVisionStructured`를 쓴다.
  - 구조화 출력: `client.beta.messages.parse` + `betaZodOutputFormat`
  - fallbacks: `'default'`
  - `IDENTITY_POLICY` system 프롬프트가 자동으로 붙는다.
- **AI용 스키마:** 얕고 단순하게 만들었다. default, transform, refine, regex를 쓰지 않는다. 모르는 값은 `''`이나 `'unknown'`으로 받는다.
- **프롬프트:** 측정 요약 JSON을 넣는다. 아이템 측정색과 box, 피부·헤어·눈 hex, 장면 색온도, 체형이 들어간다. 인물 이름은 프롬프트에 넣지 않는다. 규칙 톤과 축도 넣지 않는다. 넣으면 AI가 그 톤을 그대로 따라가서 교차 검증의 신뢰도 가점이 의미를 잃는다(2026-11-24 실측: 넣었을 때 3/3 일치, 뺐을 때 2/2 불일치).
- **병합** (`assembleVibeAnalysis`)
  - hex를 정규화하고, 잘못된 색은 측정색으로 바꾸거나 해당 아이템을 뺀다.
  - box는 0..1 범위로 자른다. 비어 있으면 측정 box를 쓴다.
  - 측정색과 ΔE가 12를 넘게 다르면 노트를 남긴다.
  - 퍼스널컬러는 측정이 있으면 측정 분류가 기준이다. AI 톤은 교차 검증에만 쓰고 결과로 신뢰도를 조정한다.
  - 측정이 없으면 AI 톤을 쓴다. AI가 읽은 피부·헤어·눈 hex로 축을 계산하는데, 이 축은 celeb-vibe-report의 갭 비교용이다.
  - AI가 톤·피부색을 비우면 규칙 초안 값(사진 중앙 픽셀)으로 되살리지 않는다. '인물 없음·사진 아님'이 확정되면 측정하지 않은 톤과 피부색은 모두 비운다.
  - AI가 아이템·팔레트·룩 이름·분위기를 비웠을 때 규칙 초안으로 채우는 것은 코디(분위기) 분석이 가능한 경우뿐이다. 채운 아이템에는 '규칙 추정' 노트를 단다.
- **결과 표시:** 마지막에 `VibeAnalysisSchema.parse`로 검증한다. `source` 값은 아래와 같다.

  | 상황 | `source` | `isMock` |
  |---|---|---|
  | AI 응답 + 브라우저 측정 | `hybrid` | false |
  | AI 응답만 | `ai` | false |
  | Mock | `mock` | true |

### 5. 저장

- **분석 결과:** `vibe_analyses` 테이블에 저장한다. 컬럼은 celeb_id, celeb_name, image_upload_id, analyzable, look_name, is_mock이다.
- **브라우저 측정값:** `kv` 테이블의 `vibe:measurement:<id>`에 저장한다. `다시 분석`은 이 값을 재사용하고 같은 id를 유지한다. 분석 중에 기록이 삭제되면 404로 끝내고 새로 만들지 않는다.
- **사용자 수정값:** 사용자가 고친 룩 이름은 `kv`의 `vibe:edit:<id>`에 따로 두어 `다시 분석` 뒤에도 유지한다. 삭제·초기화 때 함께 지운다.
- **search-celeb 사진:** `celebImageId`로 분석하면 search-celeb의 `celeb_images` 행에 `analyzable`과 사유를 기록한다. 리포트에서 같은 인물의 다른 사진을 고르라고 안내할 때 쓴다.
- **초기화:** 확인 단계에서 지워질 분석 수와, 추구미 가이드가 참조 중인 분석 수를 먼저 보여준다. 업로드 파일은 다른 앱이 참조할 수 있어 지우지 않는다.

## Mock 동작

아래 경우에는 `callVisionStructured`가 규칙 초안을 AI 응답 형태로 바꾼 값(`draftToAi`)을 그대로 돌려준다.

- 키가 없을 때
- `CELEBER_FORCE_MOCK=1`일 때
- API 실패나 사용 한도 초과로 AI가 10분간 차단됐을 때

- **실제 값:** 측정값인 피부·의상 색, 위치, 톤, 체형은 실제 사진에서 계산한 값이다.
- **데모 서술:** 아이템 이름은 아우터/상의/하의 같은 범주명만 쓰고, 소재·핏은 비워 둔다. 분위기 문장은 규칙 템플릿이다.
- **결정성:** 같은 사진과 측정값이면 같은 결과가 나온다(k-means 시드 고정, 난수 없음).
- **표시:** 결과에 `isMock=true`, `source='mock'`을 기록하고, 화면에 `데모 데이터` 배지와 폴백 사유를 보여준다.
- **현재 상태:** 루트 `.env`의 키가 2026-12-01까지 사용 한도 초과 상태다. 그래서 실제로도 Mock 폴백이 일어난다(검증 기록 참고).

## 다른 앱에서 재사용

package.json `exports`는 아래와 같다. 이 패키지를 쓰는 호스트 앱은 next.config의 `transpilePackages`에 `@celeber/celeb-vibe`를 넣어야 한다.

| 경로 | 내용 |
|---|---|
| `@celeber/celeb-vibe/flow` | `VibeFlow`, `VibeAnalyzer`, `CameraCapture`, `measureVibeImage`, `loadImage`, API 헬퍼(`uploadVibeImage`, `importVibeUrl`, `precheckVibeApi`, `analyzeVibeApi`, `reanalyzeVibeApi`, `listCelebImageOptionsApi` 등) |
| `@celeber/celeb-vibe/components` | `VibeResultView`, `HotspotPhoto`, `AnalyzabilitySummary`, `analyzabilityHeadline`, `VibeSummaryRow` |
| `@celeber/celeb-vibe/lib` | `POC_INFO`, 측정 계약 `VibeMeasurementSchema`, 순수 함수(규칙·k-means·포즈·병합), 요청 스키마, `summarizeVibe` |
| `@celeber/celeb-vibe/server` | `analyzeVibe`, `precheckVibe`, `reanalyzeVibe`, `listVibeAnalyses`, `getVibeAnalysis`, `updateVibeAnalysis`, `deleteVibeAnalysis`, `deleteAllVibeAnalyses`, `vibeResetPreview`, `importVibeImageFromUrl`, `listCelebImageOptions`, `computeServerStats`, `VibeError` |
| `@celeber/celeb-vibe/routes` | `precheckPOST`, `analyzePOST`, `importUrlPOST`, `analysesGET`, `analysesDELETE`, `analysisGET`, `analysisPATCH`, `analysisDELETE`, `reanalyzePOST`, `celebImagesGET` |

호스트 앱에서 `VibeFlow`나 `VibeAnalyzer`를 쓰면 같은 경로를 재노출해야 한다. 각 route 파일에는 `export const runtime = 'nodejs'`를 함께 둔다.

```ts
// app/api/vibe/precheck/route.ts
export { precheckPOST as POST } from '@celeber/celeb-vibe/routes';
// app/api/vibe/analyze/route.ts
export { analyzePOST as POST } from '@celeber/celeb-vibe/routes';
// 필요 시: app/api/vibe/import-url, app/api/vibe/analyses, app/api/vibe/analyses/[id], app/api/vibe/analyses/[id]/reanalyze, app/api/vibe/celeb-images
// 업로드(/api/uploads)는 모든 앱에 이미 있다.
```

## 한계

- **셀럽 사진의 색:** 스튜디오 조명, 메이크업, 보정, 필터 때문에 피부색을 객관적으로 측정할 수 없다. gray-world 보정을 약하게 하고 신뢰도 상한을 0.85로 두는 것이 대응의 전부다. 결과 화면에 조명 한계를 항상 표시한다.
- **분류기 보정값:** `classifyPersonalColor`의 축 보정값은 경험값이다(core 기반 가이드 참고). 검은 머리 인물은 대비 축이 높게 나오기 쉽다.
- **의상 색 측정의 근사**
  - 셀피 세그멘터는 셀피용이다. 전신 사진에서 옷 마스크가 부족하면 피부색이 아닌 픽셀로 대체하므로 배경이 섞일 수 있다.
  - 열린 아우터 판별은 색 차이 규칙이라, 같은 색 셋업 아우터는 상의 하나로 나온다.
  - 가방·액세서리·모자·주얼리는 AI 분석에서만 나온다.
- **체형 비율:** 정면 직립을 가정한 관절 좌표 근사치다. 원근, 자세, 굽, 헤어 볼륨에 따라 달라진다. 어깨/골반 비는 관절 폭 비라 외곽선 비보다 크게 나온다.
- **측정 없이 분석할 때:** 서버만 호출하면(예: 리포트에서 서버 함수를 직접 호출) 사진 중앙 영역 통계만으로 판정한다. 인물이 가운데 있다는 가정이라 정확도가 낮다. 가능하면 `VibeAnalyzer`나 `measureVibeImage`로 브라우저 측정값을 함께 보낸다.
- **브라우저 측정 시간:** 처음 실행할 때 wasm과 모델(약 30MB)을 로드하므로 데스크톱 기준 13~18초가 걸린다. 다음 실행부터는 캐시를 쓴다.
- **HEIC:** 받지 않는다. JPEG·PNG·WebP만 받으며, iOS Safari는 보통 JPEG로 바꿔 업로드한다.
