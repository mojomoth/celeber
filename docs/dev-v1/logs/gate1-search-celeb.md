# Gate 1: search-celeb 실제 입출력 검증

- 일시: 2026-11-24, 포트 3103, `next dev`, 키 있는 실제 모드(`CELEBER_FORCE_MOCK` 없음)
- 데이터: `pocs/.data` 사본을 별도 `CELEBER_DATA_DIR`로 썼다. 공유 DB는 건드리지 않았다.
- 서버 상태: `ai: true`, `aiProvider: openai`, `model: gpt-6.2-sol`, `imageSearch: mock`, `reverseImageSearch: false`. 프로세스의 첫 AI 호출은 Anthropic 400(사용 한도, 12/1 해제)을 거친 뒤 OpenAI로 넘어갔다.

## 결과

| 항목 | 판정 | 근거 |
|---|---|---|
| `/pocs/search-celeb` 경로 | PASS (수정함) | 원래 404였다. `next.config.ts`에 리다이렉트를 추가했다. `/pocs/search-celeb` → `/`, `/pocs/search-celeb/<경로>` → `/<경로>`(307, 쿼리 유지). 허브 링크(`:3103/`)도 200 |
| 이름 검색 (실제 AI) | PASS | `origin: 'ai'`, 후보는 `CelebCandidateSchema` 통과. 아이유 → `아이유 / IU / 가수 겸 배우`, 차은우 → `배우 · 아스트로`, 없는 이름(`쀍뷁뚥`)은 입력 이름 하나만 나왔다(지어낸 인물 없음). 1.5~3.7초 |
| 사진으로 찾기: 글자 없는 데모 사진 | PASS | `look-b.jpg`: 구도 `full-body`, 1명, 글자 `Y-3`(모자·티셔츠 로고)만 읽었다. 얼굴로 이름을 대지 않았고 실제 후보 0명이라 데모 후보와 이름 검색 안내가 나왔다. 사진과 일치한다 |
| 사진으로 찾기: 자막 넣은 사진 | PASS | 데모 사진에 가상 인물 자막을 얹었다. 자막 두 줄을 그대로 읽어 `photo-text` 후보 2명(`윤하람`/`Yoon Haram`, `haram.yoon_official`)을 만들었다. 확정 전에 "같은 사람인지 확인하지 않았다"는 확인 창이 뜬다 |
| 확정 → 대표·최근·평소 수집 → 선택 | PASS (이미지는 Mock) | `CelebProfileSchema`, `CelebImageSchema` 통과. 검색어 `차은우 배우 화보 전신` 등. 공급자는 Mock(데모 실루엣과 데모 사진) |
| 전신 판정 AI (`JudgeSchema`) | PASS | 이미지 검색이 Mock이면 앱이 이 판정을 건너뛰므로 따로 불렀다. look-a·look-b → 전신, 상반신으로 자른 사진 → 전신 아님(`하의·신발 안 보임`), 3.6초 |
| 화면 | PASS | Playwright(headless shell)로 스크린샷 10장: [shots/search-celeb-*.png](shots/). 콘솔 오류 없음 |

## 고친 것 (`pocs/search-celeb`)

1. `/pocs/search-celeb` 리다이렉트. 처음에 `:path*` 규칙 하나로 두었더니 빈 경로의 Location이 `?q=..`가 되어 자기 자신으로 무한 리다이렉트됐다. 그래서 규칙을 둘로 나눴다. 테스트: `test/pocs-path.test.ts`
2. 영문 이름 검색의 후보 중복. `Jennie`로 검색하면 AI 후보 `제니(nameEn Jennie)`와 입력 이름 `Jennie`가 따로 나왔고, 입력 이름을 고르면 같은 인물이 두 번 저장될 수 있었다. `mergeCandidates`가 영문명도 같은 후보로 보게 했다. 테스트: `test/lib.test.ts`
3. 실제 서버 검증 테스트 추가(평소 건너뜀)
   - `test/live-http.test.ts`: `CELEBER_LIVE_URL=http://localhost:3103`로 8개 확인
   - `test/judge-live.test.ts`: `CELEBER_LIVE_AI=1`로 실행. 이를 위해 `judgeImages`와 `Downloaded` 타입을 export했다

검증: `pnpm --filter @celeber/search-celeb test` 37개 통과(live 9개 건너뜀), `typecheck`·`lint` 오류 없음. search-celeb을 가져다 쓰는 celeb-vibe-report 테스트 46개도 통과했다.

## 제한과 미해결

- 이미지 검색과 역이미지 검색은 Mock이다(NAVER·SERPAPI 키 없음). 그래서 검색 결과에는 항상 "데모 데이터" 배지가 붙는다. 이름 후보 자체는 실제 AI 결과다(`origin: 'ai'`, `isMock: true`는 썸네일 때문이다).
- 자막 사진의 구도 판정이 실행마다 달랐다(`full-body` 또는 `unknown`). 자막 띠가 발을 가렸기 때문이고, 메모에는 "발이 가려졌다"고 정확히 적혔다.
- 사진 속 글자에서 나온 영문 표기(`Yoon Haram`)는 DB의 `윤하람`과 합쳐지지 않는다. 확정은 사용자가 하므로 그대로 두었다.
- 사진으로 찾기에서 후보를 찾았는데도 "SERPAPI_API_KEY가 없어 … 이름으로 검색해 주세요" 안내가 함께 나온다. 문구는 core의 역이미지 검색 사유라 고치지 않았다.
- `search.ts`는 이름 후보 캐시의 공급자 칸을 항상 `'anthropic'`으로 적는다. 동작에는 영향이 없다.
- `next dev`를 새로 띄운 직후 한 번, 브라우저가 0.05초 간격으로 계속 새로고침되는 현상을 봤다(HMR 연결 → 새로고침 반복). 서버를 다시 띄운 뒤에는 재현되지 않았다. 다른 에이전트가 같은 시각에 다른 앱 파일을 고치고 있었다.
- 하네스 주의: 하위 에이전트들이 같은 스크래치 폴더를 쓴다. 처음 쓴 `<scratchpad>/data`를 다른 에이전트가 지우고 다시 만들어 업로드 이미지가 404가 됐다. 데이터 폴더는 에이전트마다 고유한 이름으로 둬야 한다.
- 허브(3100)에는 `/pocs/search-celeb` 경로가 없다. 허브는 `:3103/`으로 직접 연결한다.
