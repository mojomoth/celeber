# search-celeb minor 수정 (라운드 1)

- 2026-11-24. 대상: [critic r2](../critic/gate1-search-celeb-r2.md) 새 결함 minor 5건(major 없음). 소유 범위 `pocs/search-celeb/**`만 수정.
- 확인: 단위 테스트 56 통과(9 건너뜀, 이전 52), typecheck·lint 0.
- 실제 확인: 포트 3103 `next dev`(새 데이터 폴더), 끝난 뒤 종료(LISTEN 0). 사진 글자 읽기는 Anthropic 400(한도) → OpenAI `gpt-6.2-sol`. 이미지 검색은 Mock. 원자료 `sc-minor-r1/*.json`.

| # | 결함 | 수정 | 테스트 | 실제 확인 |
|---|---|---|---|---|
| 1 | 사진 글자 이름만으로 설명 있는 동명이인에 연결 | `findCelebByName` strict 옵션. 후보 연결·확정은 설명 없는 이름을 설명 없는 행에만 붙임 | server.test 동명이인 | 야구선수 이민호 확정 후 자막 "이민호 공항 패션" → celebId 없음. 확정하면 새 인물, 다시 확정하면 같은 id |
| 2 | 자동완성 동명이인 구분 불가 | 부제에 설명을 앞에 둠(`suggestSubtitle`). DB의 다른 인물(celebId 다름)은 `mergeCandidates`에서 합치지 않음(확인 중 발견: 설명 없는 행이 다른 사람 설명을 받아 하나로 합쳐짐) | lib.test, server.test | suggest `이민호` → 2명, 설명 섞이지 않음 |
| 3 | 사진 글자 중복 → 칩·key 중복 | 서버 `uniqueTexts`로 중복 제거, 칩 key에 순번 | lib.test | texts `["Y-3","이민호 공항 패션"]` |
| 4 | 데모 후보 확정창 문구 | 출처별 안내 `photoConfirmNote`(데모/사진 글자/페이지 제목) | lib.test | 화면 캡처는 안 함 |
| 5 | 최근·평소 검색어에 직업 없음 | 카테고리마다 첫 검색어에 직업 추가, `전 농구선수`·`○○선수` 인식 | lib.test | recent `이민호 야구선수 2026 공항패션`, daily `이민호 야구선수 사복 전신` |

- 남은 것: 화면(자동완성 부제·확정창 문구·콘솔 key 오류) 브라우저 재확인은 검증자 몫. 45MP 영어 API 문구는 core 범위.
