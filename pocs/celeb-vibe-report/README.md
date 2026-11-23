# pocs/celeb-vibe-report — 추구미 가이드 (포트 3106)

내 퍼스널컬러 리포트(personal-color-report)와 연예인 사진의 추구미 분석(celeb-vibe)을 맞대어,
연예인 룩을 **내 팔레트 색으로 옮긴 가이드**와 **나와의 갭**, **바꿀 순서**를 보여주는 PoC.
선행 PoC(search-celeb · celeb-vibe · personal-color-report)의 플로우·컴포넌트·서버 함수를 import해서 쓴다(복사 없음).

## 실행

```bash
cd /Users/jyl/work/repo/celeber
pnpm --filter @celeber/celeb-vibe-report dev        # http://localhost:3106
pnpm --filter @celeber/celeb-vibe-report build && pnpm --filter @celeber/celeb-vibe-report start
pnpm --filter @celeber/celeb-vibe-report test       # vitest (순수 로직 + 임시 DB 통합 + AI 경로)
CELEBER_FORCE_MOCK=1 pnpm --filter @celeber/celeb-vibe-report dev   # 처음부터 Mock
```

`/pocs/celeb-vibe-report/<경로>`로 열면 `proxy.ts`가 접근 제어를 거친 뒤 `/<경로>`로 307 리다이렉트한다(`src/lib/pocs-path.ts`).

키는 루트 `.env` 하나를 쓴다(`ANTHROPIC_API_KEY`/`CLAUDE_API_KEY`, 선택 `SERPAPI_API_KEY`, `NAVER_CLIENT_ID/SECRET`). 키가 없으면 전 과정이 Mock으로 끝까지 동작한다.

## 화면 흐름

| 경로 | 내용 |
| --- | --- |
| `/` | 추구미 찾기 버튼, 내 퍼스널컬러(최근 리포트 카드), 저장한 추구미 그리드(썸네일 → 이름 → 룩 이름), 저장하지 않은 가이드 |
| `/new` | `VibeGuideFlow`: ① 내 리포트 선택 → ② 추구미 사진(이름으로 찾기 / 사진 올리기 / 이전 분석) → ③ 분석 가능 여부 → 분석 → 결과 확인 → ④ 가이드 생성 |
| `/new?report=&q=&celeb=&vibe=` | 리포트·검색어·인물·기존 분석으로 바로 시작. `report`가 없는 리포트(삭제됨·잘못된 링크)면 안내와 함께 리포트 선택 단계로 돌아간다 |
| `/guides` | 내 기록: 찾은 추구미(저장), 저장하지 않은 가이드, 내 퍼스널컬러, 가이드 초기화(지워질 항목 확인 후) |
| `/guides/[id]` | 가이드 다시보기: 저장 토글 · 룩 이름 수정 · 다시 만들기(같은 id) · 삭제(확인). 생성 직후 경고(AI 폴백 사유)는 URL 쿼리가 아니라 sessionStorage로 한 번만 넘긴다(링크로 임의 문구를 띄우는 것 방지) |
| `/report/new` | personal-color-report `PersonalColorReportFlow` 임베드(얼굴 촬영 → 전신(선택) → 리포트). 끝나면 `/new?report=<id>` |
| `/report/[id]` | 내 퍼스널컬러 다시보기(`ReportViewer`, 스타일 변경 가능, 삭제는 3105 앱에서만) |

### 분석 불가 → 같은 인물의 다른 사진 (폴백)

1. 사진 올리기 탭에서 이름(선택)과 사진을 올리면 celeb-vibe `VibeAnalyzer`가 브라우저 측정(MediaPipe) → `/api/vibe/precheck`로 분석 가능 여부를 먼저 보여준다.
2. 분석 불가면 사유(역광·흑백·인물 없음·여러 명 등)를 보여주고 `다른 사진 고르기`를 누르면
   `"올린 사진은 분석하기 어렵습니다 (사유). <이름>의 대표·최근·평소 사진에서 다시 골라 주세요."` 안내와 함께
   search-celeb `CelebSearchFlow`가 그 이름으로 검색된 상태(인물을 이미 알면 그 인물의 갤러리)로 열린다.
3. 검색 사진을 골라 분석하다 또 불가면 celeb-vibe가 `celeb_images.analyzable=false`로 표시하므로 갤러리에서 사유와 함께 비활성으로 보인다.
4. `그래도 분석하기`로 강행할 수 있고, 그 경우 결과 화면과 가이드 맨 위에 '분석이 제한된 사진' 경고를 둔다.
   celeb-vibe는 강행 분석을 `analyzable=true`로 저장하고 '인물 없음'·'여러 명'을 경고(warn)로 낮추므로, 제한 여부는 `analyzable`이 아니라 사유 코드·심각도로 판단한다(`src/lib/limits.ts` `analysisLimits`).
   사유는 가이드의 `limitations`에 저장된다. 인물을 찾지 못한 사진은 코디 색 치환·얼굴 색(피부·헤어·입술)·체형·스타일 비교를 하지 않고 사진 팔레트 매핑만 남긴다.
   제한된 사진이면 전체 요약·코디 요약은 AI 문장 대신 규칙 문장을 쓴다.
5. 아주 어둡거나 역광·강한 보정 사진(`extreme-lighting`·`backlight`·`heavy-filter`)은 가이드 맨 위에 '색이 실제와 다를 수 있는 사진' 안내를 두고, 코디 치환 사유에도 같은 주의를 붙인다.
   celeb-vibe가 그 사진을 `partial.personalColor=false`로 판정했으면 측정값이 있어도 색 5축·연예인 톤·헤어·입술 색은 비교하지 않는다(`guideVibe`).
6. 사진은 JPEG·PNG·WebP, 25MB 이하만 받는다. 형식·크기는 올리기 전에 막고, 서버의 영어 원문 오류는 한국어 안내로 바꾼다(`src/lib/upload-check.ts`).
   `proxy.ts`가 있으면 Next가 요청 본문을 10MB까지만 버퍼링하므로 `next.config.ts`에 `experimental.proxyClientMaxBodySize: '36mb'`(core 업로드 본문 상한과 같은 값)를 둔다.

사진으로 인물을 판별하지 않는다. 이름은 사용자가 적거나 search-celeb에서 확인한 메타데이터일 뿐이며, AI 프롬프트에도 넣지 않는다.

## 가이드 구성 (사진 → 관찰한 특징 → 적용할 변화)

레퍼런스: `docs/ui/drafts/v4/05-style-muse.png`, `06-my-library.png`.

1. 연예인 사진 + 룩 이름 + 한 줄 요약 + 출처(측정 계산 + AI/데모 서술) 배지
2. **팔레트 비교**: 연예인 팔레트 줄 / 내 팔레트 줄(같은 크기 원형 견본 + 이름), 연예인 색 → 내 색 매핑(ΔE2000)
3. **코디 색 치환 예시**: 원본 룩 ↔ 내 팔레트 적용(canvas 색 바꾸기) + 아이템별 치환표(유지/변경, 사유)
4. **스타일링 포인트**: 얼굴 / 코디 / 분위기 한 줄씩
5. **나와 추구미의 차이**: 레이더 + 나란히 비교 바(웜/쿨 · 명도 · 채도 · 대비 · 청탁 · 스타일 · 체형 비율), 비교 불가 축은 사유와 `전신 사진 추가` 링크
6. **얼굴 가이드**(헤어 컬러·피할 컬러 + 메이크업(여성) / 그루밍(남성·선택 안 함))
7. **코디 가이드**(치환 아이템, 유지 아이템, 실루엣 + 내 체형, 액세서리 금속)
8. **분위기 가이드**(키워드 칩, 살릴 분위기, 대비·밝기로 맞추기)
9. **쉬운 것부터 바꿔 보기**: 우선순위 액션(쉬움 → 보통 → 어려움)
10. **그대로 따라 하면 안 되는 것**: 요소 · 이유 · 대신
11. 연예인 사진 분석 자세히(celeb-vibe `VibeResultView`), 면책 문구

## 알고리즘 / 근거

- **내 팔레트**: personal-color-report `paletteFromReport(report)` (리포트에 실린 드레이핑·상의·아우터·포인트·헤어·금속 + 톤 팔레트).
- **코디 색 치환** (`src/lib/palette-map.ts`), 거리는 CIEDE2000:
  - 얼굴 가까운 아이템(아우터·상의·원피스·모자·안경·액세서리): 내 전체 팔레트와 ΔE ≤ 8이고 워스트보다 가까우면 유지, 아니면 상의·베스트·아우터·포인트 중 최근접 색. 워스트와 ΔE < 10이면 '칙칙해 보일 수 있는 색' 사유 + 따라 하면 안 되는 요소로 올린다.
  - 얼굴에서 먼 아이템(하의·신발·가방): 워스트와 ΔE ≥ 10이면 원색 유지(인상 영향이 작음), 아니면 아우터·전체 팔레트 최근접.
  - 주얼리: 금속으로 보고 내 추천 금속(`METAL_HEX`) 최근접, ΔE ≤ 10이면 유지.
  - 팔레트 매핑의 색이 코디 아이템 색이면 같은 아이템 규칙을 쓴다(골드 액세서리 → 실버 계열).
- **갭** (`src/lib/gaps.ts`, 0..100, gap = 연예인 − 나):
  - 색 5축: 내 `classification.axes`(측정) vs 연예인 `personalColor.axes`(측정). 연예인 축이 없으면 추정 톤의 core `TONE_PROTOTYPES`, 톤도 없으면 비교 불가.
  - 대비 축 코멘트에는 리포트 ④의 권장 대비(`contrastText`)를 함께 적는다(검은 머리는 측정 대비가 높게 나오기 때문).
  - 연예인 대비가 더 높을 때, 차이가 25 이상이거나 내 톤의 권장 대비가 60 미만(낮음~중간)이면 '대비를 올리라'고 하지 않는다(`pointContrastOnly`). 액션·분위기·갭 코멘트 모두 "명도 차는 하의·신발·가방에만, 얼굴 옆은 한 단계 부드러운 대비"로 안내하고, 주의 요소는 '얼굴 가까이 강한 명도 대비'로 같은 대안을 적는다.
  - 비교하지 못한 축(연예인 측정 없음)은 '비슷함'과 구분한다. 분위기 가이드의 '대비·밝기로 맞추기'도 비교 불가를 그대로 적는다.
  - 체형 비율: 등신 5.5~9 → 0~100. 내 리포트의 `bodySessionId` → `body_sessions.analysis.ratios`, 연예인은 `VibeAnalysis.body`(측정 시). 어느 쪽이든 없거나 사람 범위(3~13등신)를 벗어나면 unavailable.
  - 스타일: 키워드 사전(소프트 ↔ 시크)으로 점수화. 내 쪽은 리포트 이미지 키워드·해시태그·첫인상, 연예인 쪽은 분위기·스타일 키워드. 한쪽이라도 사전 단어가 없으면(가정값 50과 비교하지 않고) unavailable.
  - |gap| < 10 '비슷함', ≥ 25 '큰 차이'(주의 요소 후보).
- **액션**: 규칙으로 후보를 만들고(포인트·금속·립/그루밍 = 쉬움, 상의·하의 치환·스타일·대비 = 보통, 헤어 컬러·체형 실루엣 = 어려움) 쉬움 → 어려움으로 정렬, priority 1..n.
- **AI 서술** (`src/lib/ai.ts`, `src/server/index.ts`): core `callVisionStructured`(claude-opus-5-5, 구조화 출력, refusal 폴백은 core가 처리)에 연예인 룩 사진 1장 + 계산 결과(JSON)를 넣고, 얕은 스키마 `GuideAiSchema`로 요약·헤어·메이크업·코디·분위기·액션·주의 요소 서술만 받는다. 색 치환·갭·매핑 수치는 AI가 바꾸지 않는다. 병합 시 색이 붙은 규칙 항목(측정 근거)을 앞에 두고 AI 항목을 뒤에 붙이며, 액션은 다시 쉬움 → 어려움으로 정렬한다. 최종 `VibeGuideSchema.parse` 후 저장.
- **색 바꾸기 미리보기** (`src/lib/recolor.ts`, `LookRecolor`): 아이템 box 안에서 원래 옷 색과 Lab 거리가 임계값(16/22/30 중 box의 25% 이상을 덮는 최소값) 이하인 픽셀만 Lab에서 (목표 − 원색)만큼 평행 이동. 주름·음영(L 차이)은 유지되고 box 밖(얼굴·배경)은 바뀌지 않는다.

## API (`/api/guide/*`)

| 메서드 · 경로 | 설명 |
| --- | --- |
| `POST /api/guide/generate {reportId, vibeAnalysisId, skipAi?, saved?}` | 가이드 생성·저장 → `{guide, aiSource: 'ai'|'mock'|'skipped', warning?}` (400 형식 오류 / 404 리포트·분석 없음) |
| `GET /api/guide/guides?saved=1&limit=&reportId=` | 목록 `{items: GuideSummary[]}` |
| `GET /api/guide/guides?preview=reset` | 초기화 미리보기 `{count, items}` |
| `DELETE /api/guide/guides?confirm=1` | vibe_guides 전체 삭제(이 테이블만; confirm 없으면 400) |
| `GET / PATCH {saved?, lookName?} / DELETE /api/guide/guides/[id]` | 상세·수정·삭제. PATCH는 모르는 필드면 400 `validation_error`, 바꿀 필드가 없으면 400 `nothing_to_update` |
| `POST /api/guide/guides/[id]/regenerate {skipAi?}` | 같은 id로 다시 만들기(사용자가 고친 룩 이름·저장 상태 유지) |
| `GET /api/guide/reports?limit=` | 리포트 선택 목록 `{items: MyReportBrief[]}` (전신 포함 여부·베스트 컬러) |

재노출(선행 플로우가 같은 앱 경로를 호출하므로):
`/api/celeb/*`(search-celeb 전체), `/api/vibe/{precheck, analyze, import-url, analyses(GET), analyses/[id](GET·PATCH), analyses/[id]/reanalyze, celeb-images}`,
`/api/report/{generate, inputs, reports(GET), reports/[id](GET·PATCH), latest}`,
`/api/face/{environment, analyze, sessions(GET), sessions/[id](GET), latest}`, `/api/body/{analyze, sessions(GET), sessions/[id](GET), demo}`.
다른 PoC 테이블의 일괄 삭제 경로는 재노출하지 않는다(405).

camera-face / camera-body도 workspace 의존성이다(통합 단계에서 추가). `app/api/face|body/*`는 `@celeber/camera-face/routes`, `@celeber/camera-body/routes`를 같은 경로로 재노출한다.

## 재사용 export

```ts
// 플로우 ('use client')
import { VibeGuideFlow, GuideViewer, analyzabilityReasonText } from '@celeber/celeb-vibe-report/flow';
<VibeGuideFlow apiBase="" initialReportId={id} reportNewHref="/report/new" onComplete={({ guide }) => router.push(`/guides/${guide.id}`)} />
<GuideViewer guide={guide} vibe={vibe} myReport={brief} onDeleted={() => router.push('/guides')} newHref="/new" />

// 결과 뷰
import { VibeGuideView, LookRecolor, GuideGrid, MyReportCard, GapSection, PaletteMapping, SubstitutionTable, ActionList, DoNotCopyList } from '@celeber/celeb-vibe-report/components';

// 순수 함수
import { buildRuleGuide, computeGaps, substituteItem, substituteOutfit, mapCelebPalette, recolorRegion, mergeAiGuide, createGuideApi, summarizeGuide, reportBrief, wj } from '@celeber/celeb-vibe-report/lib';

// 서버 ('server-only')
import { generateVibeGuide, regenerateVibeGuide, getGuide, listGuides, updateGuide, deleteGuide, guideResetPreview, deleteAllGuides, listMyReports, loadGuideContext, myBodyRatios } from '@celeber/celeb-vibe-report/server';

// 라우트 (호스트 재노출)
// app/api/guide/generate/route.ts
export { generatePOST as POST } from '@celeber/celeb-vibe-report/routes';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// guidesGET/guidesDELETE, guideGET/guidePATCH/guideDELETE, regeneratePOST, myReportsGET
```

## Mock 동작

- 키가 없거나 `CELEBER_FORCE_MOCK=1`, AI 차단(사용 한도 초과 후 10분) 또는 호출 실패 시: 서술은 규칙 초안(`buildRuleGuide` → `draftToAi`)으로 결정적이며 `source='mock'`, `isMock=true`, 응답 `aiSource='mock'`과 경고를 돌려준다. 가이드 화면 상단과 목록 카드에 '데모 데이터' 배지, 경고 Notice를 띄운다.
- 실제 측정에서 계산하는 값: 코디 색 치환, 팔레트 매핑, 갭(색 5축·체형·스타일), 색 바꾸기 미리보기, 주의 요소.
- `skipAi=true`면 `source='rules'`, `isMock=false`.
- 선행 단계도 Mock으로 끝까지 간다: search-celeb(데모 인물·실루엣 SVG 사진), celeb-vibe(규칙 측정 + 데모 서술), personal-color-report(템플릿 서술).

## 한계

- 실제 AI 호출은 Anthropic이 2026-12-01까지 사용 한도 초과라 OpenAI(`gpt-6.2-sol`) 대체 공급자로 확인했다([gate1 로그](../../docs/dev-v1/logs/gate1-celeb-vibe-report.md)). 실제 서버 입출력 검증은 `CELEBER_LIVE_URL=http://localhost:3106 pnpm --filter @celeber/celeb-vibe-report exec vitest run test/live-http.test.ts`(유료 호출, 평소에는 건너뜀).
- 갭의 색 축은 양쪽 모두 사진 측정값이라 조명·보정 영향을 받는다. 연예인 화보는 보정이 강해 '사진의 보정 색감 그대로'를 항상 주의 요소로 둔다.
- 스타일 축은 키워드 사전 기반 근사다. 체형 비율은 등신만 비교한다.
- 색 바꾸기는 bbox + 색 거리 마스크라 옷과 비슷한 색의 배경이 box 안에 있으면 함께 바뀔 수 있다. 위치(box)가 없는 아이템은 표로만 보여준다. 브라우저 측정 없이 사진 통계로 잡은 코디(celeb-vibe `statsOnly`)와 인물 없는 사진에서는 색 바꾸기 미리보기를 만들지 않고 치환표만 보여준다.
- 데모 실루엣(Mock 이미지 검색) 사진은 브라우저 측정이 없으면 코디 아이템이 0개로 나올 수 있다 → 가이드는 팔레트 매핑과 얼굴·분위기 위주가 된다.
- 레이아웃의 floating 데모 배지는 `app/app.css`에서 헤더 아래로 옮겼다(ui 수정 금지라 앱에서 덮어씀).
