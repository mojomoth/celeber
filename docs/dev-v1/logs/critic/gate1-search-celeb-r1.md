# Gate 1 search-celeb 검증 (라운드 1, 검증자)

- 2026-11-24, 포트 3103 `next dev`를 새로 띄움(별도 데이터 사본). 끝난 뒤 종료, LISTEN 0.
- 실제 공급자: 첫 호출에서 Anthropic 400(사용 한도) → OpenAI `gpt-6.2-sol`. 이름 후보·사진 글자 읽기·전신 판정은 실제 AI. 이미지 검색·역이미지 검색은 Mock(NAVER·SERPAPI 키 없음).
- 원자료: `sc/*.json`(API 응답), `sc-*.png`(화면), `judge-live.txt`, `codex-search-celeb.txt`.

## 통과
- `/pocs/search-celeb` → 307 `/`, 쿼리 유지. `/pocs/search-celeb/api/health` → `/api/health`.
- 이름 검색: 아이유·차은우·Jennie 정상. 없는 이름은 입력 이름만 나옴. 빈 값 400, 61자 이상 400, 프롬프트 주입 문구는 무시됨.
- 사진: 글자 없는 사진·어두운 사진은 이름을 대지 않음(얼굴로 판단하지 않음). 사람 없는 사진은 `no-person`, 0명. 자막 "아이유 공항패션"에서 `아이유` 후보 하나만 나옴. 확인 창 문구 정상.
- 잘못된 형식(txt, pdf) 400 한국어 안내. 40MB는 413 한국어 안내.
- 확정 → 대표 4·최근 5·평소 6장(Mock) 수집, 선택, 다시 검색(선택 유지). 잘못된 카테고리 400, 없는 인물 404.
- 전신 판정 live 테스트(실제 AI) 1/1, 단위 테스트 37개 통과.

## 결함
1. [major] 동명이인이 하나로 합쳐짐. `김민수` 검색에서 AI가 4명(코미디언·배우·가수·농구선수)을 돌려줬으나 화면에는 1명만 나옴. 원인: `mergeCandidates`와 `findCelebByName`/`confirmCandidate`가 이름 키만으로 같은 사람으로 봄.
2. [major] 10MB 넘는 정상 사진 업로드 실패. 15MB JPEG → 400 `Failed to parse body as FormData.` dev 로그: `Request body exceeded 10MB ... middlewareClientMaxBodySize`. proxy.ts가 본문을 10MB로 자르기 때문. 안내 25MB와 다르고 오류 문구가 영어.
3. [minor] 업로드가 실패해도 사진 패널이 "이름 후보를 찾고 있습니다"로 남고 닫기 버튼이 없음.
4. [minor] 사진 글자로 후보를 찾았는데도 "SERPAPI_API_KEY가 없어 … 이름으로 검색해 주세요"가 함께 나옴. 사용자 화면에 환경변수 이름이 그대로 보임.
5. [minor] 검색창에서 Esc를 누르면 자동완성만 닫히지 않고 입력한 글자까지 지워짐. 포커스 중에는 브라우저 기본 지우기(×)와 앱의 ×가 두 개 겹쳐 보임.
6. [minor] 45MP PNG → 400 `Input image exceeds pixel limit`(영어, core).
