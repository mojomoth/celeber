# search-celeb: 연예인 검색 PoC

포트 3103 · 패키지 `@celeber/search-celeb` · API 네임스페이스 `/api/celeb/*`

## 목적

추구미로 삼을 연예인을 찾고, 그 사람의 대표·최근·평소 코디가 보이는 전신 사진을 모은다.

- 이름으로 찾기: 자동완성과 후보 목록을 보여 준다. 후보마다 인물 사진, 이름, 설명이 붙는다.
- 사진으로 찾기: 역이미지 검색 결과의 텍스트와 사진 속 글자에서 후보 이름을 뽑는다. 누구인지는 사용자가 확인해서 정한다. **얼굴 생체 인식은 쓰지 않는다.**
- 확정한 인물의 전신 사진을 모은다. 대표·최근·평소 3개 탭 그리드로 보여 주며, 썸네일 비율이 같고 출처 링크가 붙는다. 선택한 사진은 테두리와 체크로 표시한다.
- 외부 이미지는 링크로 직접 불러오지 않는다. 서버가 내려받아 `pocs/.data/uploads`에 캐시한다. 크기 제한과 SSRF 방어를 거친다.
- 검색 결과는 SQLite `celebs`와 `celeb_images`에 캐시한다. 저장한 인물 목록도 여기에 둔다.
- 검색 플로우, 컴포넌트, 서버 함수, Route Handler는 재사용할 수 있게 export한다. celeb-vibe-report가 이것을 쓴다.

## 실행

```bash
cd /Users/jyl/work/repo/celeber
pnpm --filter @celeber/search-celeb dev     # http://localhost:3103
pnpm --filter @celeber/search-celeb build && pnpm --filter @celeber/search-celeb start
pnpm --filter @celeber/search-celeb test    # vitest (lib + 서버 Mock 통합)
pnpm --filter @celeber/search-celeb lint
pnpm --filter @celeber/search-celeb typecheck
CELEBER_FORCE_MOCK=1 pnpm --filter @celeber/search-celeb dev   # 처음부터 Mock
```

키는 루트 `.env`에서 읽는다. 모든 키는 선택이며, 없으면 Mock으로 끝까지 동작한다.

| 키 | 쓰는 곳 |
|---|---|
| `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | 이미지 검색 1순위 (한국 연예인에 유리) |
| `SERPAPI_API_KEY` | 이미지 검색 2순위(Google Images), 역이미지 검색(Google Lens) |
| `CELEBER_PUBLIC_BASE_URL` | Lens가 업로드 사진을 가져갈 공개 주소 (터널 등) |
| `ANTHROPIC_API_KEY` (`CLAUDE_API_KEY`) | 이름 후보, 페이지 제목에서 이름 정리, 사진 속 글자 읽기, 전신·분석 가능 판정 |

## 화면 흐름

1. **`/` 검색**
   - 이름을 입력하면 자동완성이 뜬다. 자동완성은 이미 확정한 인물과 데모 인물로만 만들며 외부 호출을 하지 않는다.
   - "이름으로 찾기"를 누르면 후보 목록이 나온다. Instagram 07 패턴처럼 원형 사진, 이름, 설명/출처, 근거를 한 행에 보여 준다.
2. **사진으로 찾기**
   - 업로드한 사진에 "단서 찾는 중" 오버레이를 덮은 채 처리한다. 사진 맥락은 그대로 둔다.
   - 처리하는 동안 구도(전신/상반신/얼굴), 역이미지 검색 상태, 사진 속 글자를 보여 준다.
   - 끝나면 후보 목록이 나온다. 후보를 고르면 "이 인물로 확정할까요?" 확인 단계를 거친다. 후보는 텍스트에서 나온 이름이므로 사진 속 인물과 같은 사람인지 확인하지 않았다는 점을 이때 밝힌다.
3. **`/?celeb=<id>` 인물**
   - 헤더: 원형 사진, 이름, 설명, 저장 토글.
   - 대표·최근·평소 탭: 비어 있는 탭은 지금 탭부터 차례로 수집한다. 수집이 끝나면 DB에 캐시되므로 다음에는 바로 열린다.
   - "전신만 보기" 토글: 전신이 아니라고 판정된 사진을 숨긴다. 끄면 숨긴 사진도 보인다.
   - "다시 검색": 선택하지 않은 사진만 교체한다.
   - 3:4 그리드에서 사진을 고르면 선택 표시가 된다. 출처 링크가 붙고, 분석할 수 없는 사진에는 짧은 사유(역광, 저해상도 등)를 표시한다.
   - "선택한 사진" 스트립과 하단 고정 "선택 완료" 버튼이 있다.
4. **저장한 인물 / 최근 찾은 인물**: 첫 화면 아래에 있다. 행을 누르면 다시 열린다. 휴지통 버튼은 ConfirmDialog를 거친 뒤 인물과 사진 기록을 지운다.

`?q=이름`으로 들어오면 바로 검색한다. 브라우저 뒤로/앞으로 이동은 `?celeb=`와 동기화된다.

## 알고리즘과 근거

### 이름 검색 (`src/server/search.ts`)

1. **후보 수집:** 세 곳에서 후보를 모은다.
   - DB: 이미 확정한 인물. 이름, 영문명, 별칭에 검색어가 포함되면 후보가 된다.
   - Claude 텍스트 호출: 사진 없이 검색어만 보낸다. 공인 후보 최대 5명과 동명이인을 구분할 설명을 받는다. 결과는 `search_cache`에 1일 캐시한다.
   - 입력한 이름 그대로. 같은 이름의 후보가 이미 있으면 붙이지 않는다.
2. **병합:** `mergeCandidates`가 이름 키(공백, 구두점, 대소문자 무시)와 설명으로 합친다. 이름이 같아도 설명이 다르면 동명이인으로 따로 둔다. 설명이 없는 후보(사진 속 글자 등)는 이름이 같은 첫 후보에 합친다. 같은 인물이 여러 출처에서 나오면 출처 하나당 점수에 +0.1을 더한다.
3. **썸네일:** 이미지 검색 1건을 서버에 캐시해서 쓴다. 키는 `celeb-thumb:*`, 30일 캐시다.

### 사진으로 찾기 (`src/server/identify.ts`)

정책: 얼굴 특징으로 누구인지 판단하는 코드는 없다. Claude 호출에는 core의 `IDENTITY_POLICY`가 자동으로 붙는다.

1. **역이미지 검색** (SerpAPI Google Lens)
   - 지식 패널 제목은 그대로 후보가 된다. 점수는 0.95부터 시작한다.
   - 비슷한 페이지 제목은 `extractNameCandidates`로 처리한다.
     - 구분자로 자른 뒤, 한글 2~4음절 토큰(조사 제거)과 대문자로 시작하는 라틴 단어 1~3개짜리 n-gram을 만든다.
     - 불용어(패션, 공항, 매체 등)와 각 결과의 출처 사이트명은 뺀다.
     - 점수는 문서 빈도(df)를 제목 수로 나눈 값이다. 제목이 3개 이상이면 df 2 이상만 남긴다.
     - 짧은 n-gram이 같은 빈도의 더 긴 n-gram에 포함되면 버린다. 예: `Kang`은 `Kang Ian`에 흡수된다.
   - AI를 쓸 수 있으면 **제목 텍스트만** Claude에 보낸다. 제목에 적힌 이름을 정리시키고, 사진은 보내지 않는다.
2. **사진 속 글자** (Claude 비전)
   - 캡션, 자막, 이름표, 워터마크, @계정처럼 "글자로 보이는 것"만 옮겨 적게 한다.
   - 외모로 이름을 추측하는 것은 프롬프트에서 금지한다.
   - 같은 호출에서 구도(framing)와 인원수도 받는다. 업로드 사진을 추구미 분석에 바로 쓸 수 있는지 참고하기 위해서다.
3. **결과 처리:** 후보를 합쳐 보여 주고, 사용자가 확인해야 확정된다.
   - 역이미지 검색을 쓸 수 없으면(키 또는 공개 URL이 없을 때) 데모 후보와 함께 "이름으로 검색해 주세요"를 안내한다.

### 전신 사진 수집 (`src/server/images.ts`)

1. **검색어:** `buildCategoryQueries`가 카테고리별 검색어를 만든다.

   | 카테고리 | 검색어 |
   |---|---|
   | 대표 | `이름 [직업] 화보 전신` / `이름 레드카펫` / `이름 시상식 전신` |
   | 최근 | `이름 {올해} 공항패션` / `이름 {올해} 행사 전신` / `이름 {작년} 공항패션` (1~2월에는 작년 기준) |
   | 평소 | `이름 사복 전신` / `이름 일상 패션` / `이름 데일리룩` |

2. **검색:** 프로바이더 우선순위는 네이버 > SerpAPI > Mock이다. 프로바이더가 실패하면 다음 것으로 넘어간다. 결과는 `search_cache`에 7일 캐시한다.
3. **1차 필터 (메타데이터):**
   - `judgeByMetadata`: 세로 비율(높이/너비) 1.25 이상이고 높이 500px 이상이면 전신으로 추정한다. 그보다 작으면 저해상도로 본다.
   - `rankSearchResults`: 순서는 전신, 크기 미상, 전신 아님이다. URL 중복과 이미 저장된 URL은 뺀다.
4. **캐시:**
   - `cacheRemoteImage`는 core의 `fetchImageSafe`를 쓴다.
     - http(s)와 80/443 포트만 허용한다.
     - 사설, 루프백, 링크로컬 IP를 차단하고, 해석한 IP로 연결을 고정해 DNS 리바인딩을 막는다.
     - 리다이렉트는 매번 다시 검증한다.
     - 크기는 10MB, 시간은 10초로 제한한다.
     - 이미지 매직바이트를 확인한다.
   - 원본을 받지 못하면 검색 썸네일을 대신 캐시한다. 이 경우 `analyzable=false`가 된다.
   - 동시 다운로드는 4개, 카테고리당 목표는 9장이다.
5. **2차 판정 (Claude 비전):** 키가 있을 때만 한다.
   - 512px로 줄인 이미지를 한 번에 판정한다. effort는 low다.
   - 받는 값: `isFullBody`, `analyzable`, `personCount`, 사유 코드(역광, 가림, 여러 명, 저해상도 등).
   - 실패하거나 차단되면 메타데이터 판정을 그대로 쓴다.
6. **저장:** `celeb_images`에 넣는다. 컬럼은 `celeb_id, category, provider, source_url, upload_id, is_full_body, analyzable, selected, is_mock`이고, `UNIQUE(celeb_id, source_url)`로 중복을 막는다.

## API (`/api/celeb/*`)

| 메서드·경로 | 설명 |
|---|---|
| `GET /api/celeb/suggest?q=` | 자동완성 (DB + 데모 인물) |
| `GET /api/celeb/search?q=` | 이름 후보 (`SearchResponse`) |
| `POST /api/celeb/identify {uploadId}` | 사진 단서 후보 (`IdentifyResponse`). 업로드는 `POST /api/uploads` (`kind=celeb`) |
| `GET /api/celeb/celebs?saved=1&limit=` | 인물 목록 (`{items: CelebSummary[]}`) |
| `POST /api/celeb/celebs {candidate}` | 후보 확정 → `{celeb}` (이름 키 + 설명으로 upsert. 설명이 다르면 새 인물) |
| `GET/PATCH/DELETE /api/celeb/celebs/[id]` | 상세(카테고리별 사진) / `{saved}` 토글 / 삭제(사진 기록 포함) |
| `GET/POST /api/celeb/celebs/[id]/images` | 저장된 사진 / `{category, refresh?}` 수집 (`CollectImagesResponse`) |
| `PATCH /api/celeb/images/[id] {selected}` | 사진 선택 표시 |

모든 응답에는 `isMock`과 `origin`(rules/ai/mock), `notices`가 들어 있다. UI는 결과마다 "데모 데이터" 배지를 붙인다.

## 재사용 (celeb-vibe-report 등)

```tsx
// 클라이언트
import { CelebSearchFlow } from '@celeber/search-celeb/flow';
<CelebSearchFlow selection="single" completeLabel="이 사진으로 분석" onComplete={({ celeb, selectedImages, uploadedPhoto }) => ...} />

import { CelebSearchBox, CandidateList, CelebGallery, SavedCelebList, IdentifyPanel, CelebProfileHeader, CelebAvatar } from '@celeber/search-celeb/components';
import { createCelebApi, buildCategoryQueries, extractNameCandidates, judgeByMetadata, type CelebSearchResult } from '@celeber/search-celeb/lib';

// 서버
import { searchCelebCandidates, identifyFromPhoto, confirmCandidate, collectCelebImages, getCelebDetail, selectedImages, listCelebSummaries } from '@celeber/search-celeb/server';
```

호스트 앱은 아래 파일을 만들어 같은 경로를 재노출한다. 각 파일에는 `export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';`를 추가한다. `/api/uploads`, `/api/uploads/[id]`는 모든 앱에 이미 있다.

```ts
// app/api/celeb/suggest/route.ts
export { suggestGET as GET } from '@celeber/search-celeb/routes';
// app/api/celeb/search/route.ts
export { searchGET as GET } from '@celeber/search-celeb/routes';
// app/api/celeb/identify/route.ts
export { identifyPOST as POST } from '@celeber/search-celeb/routes';
// app/api/celeb/celebs/route.ts
export { celebsGET as GET, celebsPOST as POST } from '@celeber/search-celeb/routes';
// app/api/celeb/celebs/[id]/route.ts
export { celebGET as GET, celebPATCH as PATCH, celebDELETE as DELETE } from '@celeber/search-celeb/routes';
// app/api/celeb/celebs/[id]/images/route.ts
export { celebImagesGET as GET, celebImagesPOST as POST } from '@celeber/search-celeb/routes';
// app/api/celeb/images/[id]/route.ts
export { imagePATCH as PATCH } from '@celeber/search-celeb/routes';
```

## Mock 동작

| 상황 | 동작 |
|---|---|
| 이미지 검색 키 없음 | core Mock 프로바이더가 가상 인물의 전신 실루엣 SVG(데모)를 돌려준다. 캐시도 같은 경로(`/api/uploads`)를 거친다. `sourceUrl`은 `mock://celeb/<이름>/<카테고리>/<해시>`다. |
| AI 키 없음 또는 사용 한도 초과 | 이름 후보는 `mockNameSearch`(데모 인물 4명과 입력 이름)를 쓴다. 전신 판정은 메타데이터 규칙으로 하고, 사진 속 글자 읽기는 건너뛴다. 응답의 `origin`이 `mock`/`rules`가 되고 `warning`은 한 줄로 정리된다. |
| SerpAPI 키 또는 공개 URL 없음 | 역이미지 검색이 `unavailable`이 된다. 데모 후보 4명과 "이름으로 검색해 주세요"를 안내한다. |

데모 인물과 데모 이미지에는 "데모 데이터"/"데모 인물" 배지가 붙는다.

## 한계

- 이름 n-gram 추출은 휴리스틱이다. 제목이 적거나 매체명이 불용어 목록에 없으면 잡음 후보가 섞일 수 있다. 확정은 항상 사용자가 한다.
- 네이버 이미지 API는 페이지 URL을 주지 않는다. 그래서 출처 링크가 이미지 호스트가 된다. 일부 호스트는 핫링크 방지 때문에 다운로드가 실패하고, 그 사진은 제외되거나 썸네일로 대체된다.
- Lens는 공개 URL만 받는다. 로컬 개발에서 사진 역검색을 하려면 `CELEBER_PUBLIC_BASE_URL`(터널)이 필요하다.
- 메타데이터 전신 판정(세로 비율)은 근사다. 정확한 판정은 AI 키가 있을 때만 한다.
- 인물을 삭제해도 캐시 이미지 파일은 남긴다. uploads는 sha256 기준으로 다른 앱과 공유될 수 있기 때문이다.
- HEIC는 지원하지 않는다. 파일 입력은 JPEG/PNG/WebP로 제한한다.
