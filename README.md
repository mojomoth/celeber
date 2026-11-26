# CELEBER

사진으로 퍼스널컬러를 알아보고 연예인 스타일을 내게 맞춰 보는 앱이다. pnpm workspace, Node 26, Next.js 16 App Router를 쓴다.

- 요구사항: [docs/POC.md](docs/POC.md)
- 디자인: [docs/ui/design/DESIGN.md](docs/ui/design/DESIGN.md)
- 결과 보고: [docs/POC-RESULT.md](docs/POC-RESULT.md)

## 통합 앱 실행

```bash
node -v             # v26 이상
pnpm install --frozen-lockfile
pnpm fetch:models
pnpm dev            # http://localhost:3108
```

루트 `.env`에 `OPENAI_API_KEY` 또는 `OPENAI_KEY`가 있으면 실제 비전 분석과 이미지 검색을 쓸 수 있다. [통합 흐름과 HIL 확인 항목](docs/wiki/integration-flow.md)을 참고한다.

[운영 앱](https://celeber.onrender.com)은 접속 코드 없이 열린다. 분석과 업로드는 브라우저 세션별로 영구 디스크에 저장한다. 다른 브라우저를 쓰거나 쿠키를 지우면 새 세션이 시작된다. 카메라 촬영은 localhost 또는 HTTPS에서 가능하다. 배포 설정은 [render.yaml](render.yaml)에 있다.

## 구조와 포트

| 포트 | 경로 | 패키지 | 역할 | 선행 |
| --- | --- | --- | --- | --- |
| 3100 | `pocs/hub` | `@celeber/hub` | 허브: 랜딩, 6개 PoC 링크·선행관계·실행 상태, Mock/실제 모드, 디자인 토큰 미리보기 | - |
| 3101 | `pocs/camera-face` | `@celeber/camera-face` | 환경·정면·측면 촬영 → 보정 피부색, 얼굴 윤곽, 옆선 | - |
| 3102 | `pocs/camera-body` | `@celeber/camera-body` | 전신 사진 → 등신·상하체·어깨/골반 비율, 체형 | - |
| 3103 | `pocs/search-celeb` | `@celeber/search-celeb` | 연예인 검색(이름 기본, 사진은 텍스트 단서) → 대표·최근·평소 전신 사진 | - |
| 3104 | `pocs/celeb-vibe` | `@celeber/celeb-vibe` | 사진 한 장 → 분석 가능 여부, 코디·퍼스널컬러·분위기 | - |
| 3105 | `pocs/personal-color-report` | `@celeber/personal-color-report` | 퍼스널컬러 리포트 ([레퍼런스 카드](docs/ui/personal-color-report-guide/navy-men-personal-color-report-card.jpeg) 구성) | camera-face, camera-body(선택) |
| 3106 | `pocs/celeb-vibe-report` | `@celeber/celeb-vibe-report` | 추구미 가이드: 내 리포트와 연예인 분석의 갭, 얼굴·코디·분위기 가이드 | search-celeb, celeb-vibe, personal-color-report |
| 3107 | `pocs/ui/mockup` | `@celeber/ui-mockup` | v4 화면 목업 | - |
| 3108 | `apps/web` | `@celeber/web` | 실제 촬영, 분석, 퍼스널컬러, 추구미와 내 기록 | PoC Route Handler와 v4 화면 |
| - | `pocs/core` | `@celeber/core` | 계약(zod), 색 과학, 퍼스널컬러 분류기·12톤 팔레트, 얼굴 색 샘플링, Mock, 서버 전용(SQLite·업로드·AI·검색) |  |
| - | `pocs/ui` | `@celeber/ui` | 디자인 토큰(CSS 변수), 공용 컴포넌트, BI, MediaPipe 로더 |  |

후행 앱은 선행 앱의 촬영 플로우(`./flow`)와 Route Handler(`./routes`)를 import해서 같은 경로(`/api/face/*`, `/api/body/*` 등)로 다시 노출한다. 그래서 3105 하나만 띄워도 얼굴·전신 촬영부터 리포트까지 끝까지 진행할 수 있고, 3106 하나만 띄워도 리포트 만들기부터 가이드까지 진행할 수 있다.

데이터는 모든 앱이 같은 파일을 쓴다: `pocs/.data/celeber.db`(SQLite, Node 내장 `node:sqlite`)와 `pocs/.data/uploads/`. 한 앱에서 저장한 세션을 다른 앱에서 바로 고를 수 있다.

## 설치

```bash
corepack enable                 # pnpm 11.6 (package.json packageManager)
node -v                         # v26 이상
pnpm install                    # sharp 네이티브 바이너리 설치 포함
pnpm fetch:models               # MediaPipe 모델이 없을 때만 (pocs/ui/static/mediapipe, 약 60MB)
```

MediaPipe wasm·모델과 BI 에셋은 각 앱의 `predev`/`prebuild`에서 `public/`으로 자동 동기화된다(`pnpm sync:public`으로 수동 실행 가능). 브라우저에서 얼굴·포즈 인식이 오프라인으로 동작한다.

## .env 설정

루트 `.env` 하나를 모든 앱이 읽는다. 템플릿은 [.env.example](.env.example)이다. 모든 키는 서버 전용이다. PoC에는 키 없이 확인할 수 있는 데모 데이터가 있다.

| 키 | 용도 | 없을 때 |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` (별칭 `CLAUDE_API_KEY`) | Claude 비전·구조화 출력: 환경 메모, 얼굴 서술(스타일 표현), 전신 코디 서술, 인물 후보 이름 정리·사진 속 글자 읽기·전신 판정, 추구미 분석, 리포트 서술, 가이드 서술 | 규칙 기반 결과 + 템플릿 서술 |
| `CELEBER_VISION_MODEL` | 모델 ID (기본 `claude-opus-5-5`) | 기본값 |
| `CELEBER_VISION_EFFORT` | `low`~`max` (기본 `medium`). 호출마다 `low`/`medium`을 따로 지정하는 곳이 있다 | 기본값 |
| `OPENAI_API_KEY` (별칭 `OPENAI_KEY`) | 대체 비전·텍스트 AI와 이미지 검색 | Anthropic, 다른 이미지 검색 공급자 또는 데모 |
| `CELEBER_OPENAI_MODEL` | OpenAI 모델 ID (기본 `gpt-6.2-sol`) | 기본값 |
| `CELEBER_AI_PROVIDER` | `auto`(기본, Anthropic → OpenAI) · `anthropic` · `openai` | `auto` |
| `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | 네이버 이미지 검색 (한국 연예인 우선) | SerpAPI → OpenAI → 데모 |
| `SERPAPI_API_KEY` | Google Images 검색 + Google Lens 역이미지 검색 | 사진으로 찾기는 "이름으로 검색해 주세요" 안내 |
| `CELEBER_PUBLIC_BASE_URL` | 로컬 업로드 사진을 Lens가 가져갈 수 있는 공개 주소(터널 등). Lens에는 서명·10분 만료 이미지 경로(`/api/public-image/<id>?exp&sig`)만 넘긴다 | 업로드 사진 역검색 비활성 |
| `CELEBER_PUBLIC_IMAGE_SECRET` | 위 공개 이미지 URL의 HMAC 비밀값 | `CELEBER_ACCESS_TOKEN`, 그것도 없으면 프로세스마다 임의값 |
| `CELEBER_SESSION_SECRET` | 통합 앱의 익명 브라우저 세션 쿠키 서명 키. 운영에서는 32바이트 이상의 무작위 값을 설정 | 로컬용 세션 키 |
| `CELEBER_ACCESS_TOKEN` | 원격 PoC 접근 토큰. PoC는 `<주소>?access=<토큰>`도 지원 | PoC는 기본값으로 로컬에서만 접근 가능 |
| `CELEBER_ALLOWED_HOSTS` | 토큰 없이 허용할 추가 호스트(쉼표 구분) | localhost만 |
| `CELEBER_DATA_DIR` | DB·업로드 폴더 (기본 `pocs/.data`) | 기본값 |
| `CELEBER_FORCE_MOCK` | `1`이면 키가 있어도 모든 외부 API를 Mock으로 | - |
| `CELEBER_HUB_PROBE_HOST` | 허브가 각 앱 상태를 확인할 호스트 (기본 `127.0.0.1`) | 기본값 |

AI 호출이 인증·권한·사용 한도 오류로 실패하면 그 앱 프로세스는 해당 공급자를 10분 동안 건너뛰고 다음 공급자로, 남은 공급자가 없으면 Mock으로 동작한다(허브와 각 앱 `/api/health`의 `capabilities.aiProvider`, `aiBlockedReason`). 화면에는 짧은 한국어 사유만 나오고 원본 오류는 서버 로그에만 남는다.

## 실행

```bash
pnpm dev:all                    # 허브 + 6개 앱을 개발 모드로 동시에 (3100~3106)
pnpm dev:hub                    # 하나씩: dev:hub, dev:camera-face, dev:camera-body, dev:search-celeb,
pnpm dev:personal-color-report  #          dev:celeb-vibe, dev:personal-color-report, dev:celeb-vibe-report

pnpm build:all && pnpm start:all   # 프로덕션 빌드 후 7개 동시 기동
CELEBER_FORCE_MOCK=1 pnpm start:all # 키가 있어도 Mock으로
```

허브 <http://localhost:3100>에서 각 앱의 실행 여부, 앱별 Mock/실제 모드, 공유 DB 건수를 보고 바로 이동할 수 있다.

- 카메라(`getUserMedia`)는 보안 컨텍스트에서만 열린다. `localhost`는 되지만 휴대폰에서 `http://192.168.x.x:3105`로 열면 카메라가 막힌다. 휴대폰 실촬영은 HTTPS 터널을 쓰고, 그 외에는 모든 카메라 단계의 **업로드 대체 경로**를 쓴다.
- **터널 주의**: PoC에는 로그인이 없다. 터널로 열면 얼굴 사진(`/api/uploads`), 세션·리포트 목록, 삭제 API, 유료 AI 호출 API가 인터넷에 노출될 수 있다. 그래서 모든 앱의 `proxy.ts`가 localhost가 아닌 Host를 막는다. 터널을 쓸 때는 `.env`에 `CELEBER_ACCESS_TOKEN`을 정하고 휴대폰에서 `https://<터널>/capture?access=<토큰>`으로 한 번 연다. Lens용 서명 이미지 경로만 토큰 없이 통과한다. 터널 URL과 토큰은 공유하지 말고, 쓰지 않을 때는 터널을 닫는다.
- 같은 `proxy.ts`가 다른 사이트에서 보낸 상태 변경 요청(POST/PUT/PATCH/DELETE, `Sec-Fetch-Site: cross-site` 또는 Host와 다른 Origin)을 403으로 거부한다(localhost CSRF 방지).
- 업로드는 JPEG/PNG/WebP를 권장한다. HEIC는 sharp 기본 빌드에서 디코드하지 못할 수 있다(실패 사유를 화면에 표시).

## 검증 명령

```bash
pnpm typecheck && pnpm lint && pnpm test   # 9개 패키지 tsc, eslint, vitest (총 344개)
pnpm build:all                             # 7개 앱 next build
pnpm smoke                                 # 앱이 떠 있는 상태에서: 홈·주요 API 200 + 공유 DB E2E
pnpm smoke -- --keep                       # E2E에서 만든 기록을 남겨 화면에서 이어 보기
```

`pnpm smoke`(scripts/smoke.mjs)는 카메라 없이 합성 사진을 올려 다음 흐름을 확인하고, 만든 기록을 끝에 지운다.

1. camera-face(3101): 환경 사진 업로드 → `/api/face/environment` → 정면 사진(실제 FaceLandmarker 랜드마크 픽스처 위에 그린 합성 얼굴) → `/api/face/analyze` → 세션 저장
2. camera-body(3102): `/api/body/demo` 전신 세션
3. personal-color-report(3105): `/api/report/inputs`에 두 세션이 보이는지 → `/api/report/generate`(남성 변형) → 카드 섹션 ①~14, 웜+쿨=100, 드레이핑 4/4 확인
4. celeb-vibe-report(3106): `/api/guide/reports`에 그 리포트가 보이는지
5. search-celeb(3103) 이름 검색·확정·대표 사진 수집 → celeb-vibe(3104) 사진 분석 → 3106 `/api/guide/generate` → 상세 페이지

## PoC별 테스트 시나리오 (카메라 없는 데스크톱)

샘플 사진: 직접 찍은 정면 셀피가 가장 좋다. 없으면 `docs/ui/personal-color-report-guide/navy-men-personal-color-report-card.jpeg`의 인물 사진 부분을 잘라 정면으로, `docs/ui/refs/screens/03-doji-front-selfie.jpg`·`04-doji-side-selfie.jpg`를 정면·측면으로, `01-doji-lighting-guide.jpg`를 환경 사진으로 쓸 수 있다(앱 화면 캡처라 테두리 UI가 측정에 섞인다). 전신·코디 사진은 `09-ssense-outfit-gallery.jpg`, `10-doji-outfit-preview.jpg`를 잘라 쓴다.

### 1. camera-face (3101)

1. `/capture` → 안내 → 환경 촬영 화면에서 **사진 업로드**로 환경 사진을 고른다. 광원·색온도·밝기·실내외와 경고가 나온다. 흰 종이가 보이면 눌러서 기준 백색으로 지정한다(선택).
2. 정면 단계에서 업로드 → 윤곽선 미리보기 → "사용하기". 측면도 업로드하거나 건너뛴다.
3. `/sessions/<id>`에서 사진 위 윤곽 오버레이, 보정 전후 피부색(hex·Lab·ITA·색상각·채도), 부위별 색, 얼굴형 점수, 옆선·E-라인, 신뢰도와 사유를 확인한다.
4. 확인할 것: 백열등·형광등 사진은 재촬영 권장, 얼굴이 없는 사진은 정면에서 거부, `/sessions`의 삭제는 확인 단계를 거친다.

### 2. camera-body (3102)

1. 홈의 **데모 데이터로 결과 보기**로 즉시 결과 화면을 확인한다.
2. `/capture` → **사진 올리기**(주 경로)로 머리부터 발까지 나온 사진을 올린다. 등신 눈금·관절 오버레이, 기준 7.5등신 비교, 수치별 범위 막대, 체형 점수와 근거, 자세 경고가 나온다.
3. 발이 잘린 사진은 실패 사유("발목이나 발이 잘려…")가 나온다. **건너뛰기**는 "전신 사진 추가" 상태로 저장된다.

### 3. search-celeb (3103)

1. 이름 입력(예: 데모 인물 `윤하람`) → 후보 목록 → 인물 화면에서 대표·최근·평소 탭 그리드, "전신만 보기", 사진 선택(테두리+체크), 출처 링크를 확인한다.
   - 키가 없으면 카테고리마다 **데모 사진 1장**(실제 래스터 전신 사진, `pocs/core/fixtures/demo-people`, 검색한 인물과 무관한 데모 모델)과 **데모 실루엣**(SVG)이 나온다. 실루엣은 사람 검출이 안 되므로 미리 "데모 실루엣 · 분석 불가"로 표시되고 선택할 수 없다. 데모 사진은 celeb-vibe에서 코디·퍼스널컬러·분위기까지 분석된다.
2. **사진으로 찾기**: 사진을 올리면 구도·역이미지 검색 상태·사진 속 글자를 보여 주고 후보를 제시한다. 키가 없으면 "이름으로 검색해 주세요" 안내와 데모 후보가 나온다. 후보를 고르면 "사진 속 인물과 같은 사람인지 확인하지 않았다"는 확인 단계를 거친다.
   - 실제 역이미지 검색 검증 조건: `SERPAPI_API_KEY` + `CELEBER_PUBLIC_BASE_URL`(외부에서 열리는 HTTPS 터널 주소) + 터널을 쓸 때의 `CELEBER_ACCESS_TOKEN`. 둘 중 하나라도 없으면 `reverse.status=unavailable`이 정상이다. AI 키가 없으면 사진 속 글자 읽기도 건너뛴다.

### 4. celeb-vibe (3104)

1. `/`에서 인물 이름(선택) + 사진 업로드, 또는 search-celeb에 저장된 사진 선택.
2. 브라우저 측정 후 분석 가능 여부(인물 수·구도·역광·흑백·저해상도)가 먼저 나온다. 흑백 사진은 불가로 판정되고 "다른 사진 고르기 / 그래도 분석하기"가 나온다.
3. 결과: 사진 위 아이템 핫스팟, 코디 항목, 퍼스널컬러 톤과 축, 분위기, 팔레트.

### 5. personal-color-report (3105)

1. `/new` → **저장된 얼굴 분석 선택**(1에서 만든 세션) + 전신 세션 선택 또는 "전신 없이" → 진단 준비에서 리포트 스타일(남성/여성/선택 안 함) → 생성.
2. 또는 `/new?step=capture`로 얼굴 촬영 → 전신(건너뛰기 가능)을 이 앱 안에서 업로드로 진행한다.
3. `/reports/<id>`를 레퍼런스 카드와 나란히 놓고 헤더 → 업로드한 사진 → ①~⑪ → 전신 스타일링 → 12~14 → 면책 순서를 확인한다. ⑤ 드레이핑은 내 사진 턱 아래에 천만 합성된다. 스타일을 바꾸면 ⑥⑦⑧⑩이 바뀐다. 14 신뢰도는 조명이 나쁜 세션에서 낮게 나온다.

### 6. celeb-vibe-report (3106)

1. `/new` → ① 내 리포트(최근 것이 기본 선택, 없으면 `/report/new`로 만들기) → ② 이름으로 찾기/사진 올리기/이전 분석 → ③ 분석 가능 여부 → 분석 → ④ 가이드 생성.
2. 분석이 불가한 사진(예: 흑백)을 올리면 사유와 함께 "<이름>의 대표·최근·평소 사진에서 다시 골라 주세요"로 search-celeb 갤러리가 열린다.
3. `/guides/<id>`: 팔레트 매핑(연예인 색 → 내 팔레트, ΔE), 같은 사진·조명에서 옷 색만 바꾼 비교, 7축 갭(레이더·막대), 얼굴·코디·분위기 가이드, 우선순위 행동, 따라 하지 말 것.
   - 연예인 사진에서 얼굴을 측정하지 못한 분석(사진 통계 폴백, 신뢰도 0.3 미만)이면 색 5축 갭은 "비교하지 않음"으로 표시되고 행동 제안에 쓰이지 않는다. 헤어·눈 색이 없으면 대비 축만 비교하지 않는다. AI가 읽은 색이면 "(추정)"이 붙는다.
   - 키 없이 끝까지 보려면: `/new` → 이름으로 찾기 → `윤하람` → 대표 탭의 **데모 사진** → 분석 → 가이드.

## 데이터 초기화

- **내 정보 전체 초기화(화면)**: celeb-vibe-report(3106) `/guides` 맨 아래 "내 정보 전체 초기화". 확인 단계에서 지울 항목(얼굴·전신 분석, 퍼스널컬러 리포트, 추구미 가이드 건수와 내 사진 파일 수)을 먼저 보여 주고, 실행하면 그 기록과 **다른 레코드가 참조하지 않는 내 사진 파일**(촬영·업로드한 얼굴·환경·전신 사진 포함)까지 지운다. 연예인 검색·사진 분석은 남는다. API: `GET /api/guide/my-data`(미리보기), `DELETE /api/guide/my-data?confirm=1`.
- 앱별: 각 앱 목록 화면의 초기화 버튼. 지워지는 항목을 확인한 뒤 그 앱의 테이블만 지운다. API로는 `DELETE /api/face/sessions?confirm=1`(3101), `/api/body/sessions?confirm=1`(3102), `/api/report/reports?confirm=1`(3105), `/api/guide/guides?confirm=1`(3106), `/api/vibe/analyses` + 본문 `{"confirm":true}`(3104). search-celeb 인물은 인물별 삭제(`DELETE /api/celeb/celebs/<id>`)만 있다.
- 전체: 모든 앱을 끈 뒤

  ```bash
  pnpm reset:data           # 지워질 테이블별 건수와 업로드 파일 수만 보여 준다
  pnpm reset:data -- --yes  # DB(+WAL)와 uploads 폴더를 삭제. 실행 중인 앱이 있으면 거부
  ```

  다음 실행 때 빈 DB가 자동으로 만들어진다.
- 업로드 파일은 sha256+종류로 앱 간에 공유되므로 앱별·개별 삭제로는 파일이 남는다. 화면에서 파일까지 지우려면 "내 정보 전체 초기화"를, 연예인 데이터까지 모두 지우려면 `pnpm reset:data -- --yes`를 쓴다.

## 규칙

- 각 앱의 재사용 모듈은 `package.json` `exports`로 노출한다: `./flow`(클라이언트 플로우), `./components`, `./lib`(순수 함수), `./server`(서버 전용), `./routes`(호스트 앱이 재노출할 Route Handler).
- 재사용 모듈(`src/`) 안에서는 `@/` 경로 별칭을 쓰지 않는다(다른 앱이 트랜스파일할 때 깨진다).
- 인물 식별: 얼굴 특징으로 신원을 판단하지 않는다. 이름 검색이 기본이고, 사진은 역이미지 검색 결과 제목과 사진 속 글자로 후보만 제시한 뒤 사용자가 확정한다. 이 정책은 모든 AI 호출의 system 프롬프트 앞에 자동으로 붙는다(`IDENTITY_POLICY`).
- 라우트 파일을 지우거나 옮긴 뒤 typecheck가 `.next/types/validator.ts`에서 실패하면 그 앱의 `.next`만 지우고 다시 빌드한다.
