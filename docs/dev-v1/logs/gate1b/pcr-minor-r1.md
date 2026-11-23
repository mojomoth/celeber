# personal-color-report minor 정리 라운드 1 (2026-11-24)

기준: critic pcr-r2 run-log의 남은 이슈 중 앱 범위 4건 + core 회귀 1건. 소유 파일 pocs/personal-color-report/** 만 수정.

| 이슈 | 재현 | 수정 | 확인 |
|---|---|---|---|
| ⑭ 새 ROI 누락 문구 미인식 (core 회귀) | core buildSkinMeasurement 문구 → skinReasonTexts [] | assemble.ts 정규식 2개 추가(일부/전부 누락). core에 구조화 사유 코드 없음 | gate1b-minor.test.ts (core 함수로 문구 생성) |
| ⑬ '빛을 마주 봐 주세요' 마침표 누락 | 템플릿 리포트 | cautionItems가 문장 끝 마침표 보장 | gate1b-minor + report.test 기대값 갱신 |
| 빈 업로드가 '끝까지 읽지 못했습니다' | dev 3105 curl -X POST 빈 본문 | uploadPOST가 읽은 바이트 0이면 '첨부된 사진이 없습니다. 사진을 선택해 주세요.' | 단위 3종 + dev curl(빈 본문·빈 multipart → 새 문구, 잘린 본문·27MB·정상 업로드 기존대로) |
| ② 막대 85%와 신뢰도 45% 혼동 | 소스 확인 | 막대 아래 '12톤 사이의 상대 적합도…판정 신뢰도는 N%' 표시, AI 프롬프트에 '%는 신뢰도가 아님' | SSR 렌더 테스트 |
| AI 독립 판정에 규칙 결과 포함 | 프롬프트 확인 | 독립 판정을 규칙 결과 없는 별도 호출(AiOpinionSchema)로 분리, 서술 호출과 병렬 | ai-path.test 단언 추가 |

core 범위(버건디 브라운, 27MB 413 문구)는 건너뜀. 27MB는 dev에서 이미 '(최대 25MB)' 표시.
결과: app test 57 pass/1 skip, typecheck·lint 0, celeb-vibe-report typecheck 0. dev 3105는 CELEBER_FORCE_MOCK=1로 띄웠다가 종료(3105 LISTEN 0). 실제 AI 호출은 안 함.
