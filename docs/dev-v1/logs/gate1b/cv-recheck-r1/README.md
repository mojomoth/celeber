# celeb-vibe minor 정리 독립 재검증 라운드 1 (2026-11-24)

- 실행: 3104 dev(`CELEBER_DATA_DIR`=scratchpad 사본, FORCE_MOCK 없음). Anthropic 400(사용 한도) 뒤 OpenAI `gpt-6.2-sol`(`/api/meta` aiProvider=openai). 끝나고 종료함. 시작 전 3104를 다른 작업이 쓰고 있어 비워질 때까지 기다렸다.
- test 97/97, typecheck·lint 오류 없음. 키 값이 든 파일 0개.
- 실제 호출: API 8건(측정 없음, force 2건+재분석), UI 3건(MediaPipe 측정, hybrid), 측정 재분석 2건. 모두 isMock=false, 데모 배지 0.

## 이전 이슈

| 이슈 | 결과 | 근거 |
|---|---|---|
| AI 문장이 내부 입력 언급 | 해결. 모든 문자열 필드 검사, API 8건·재분석 2건·UI 3건에서 0건(앱 고정 문구 '픽셀 측정값이 아닙니다'·'측정값 없음'만) | `api-summary.json`, `ui-result.json` |
| 언더톤 보류인데 축 요약 '뉴트럴 쿨' | 해결. '웜·쿨 보류 · 명도 딥 …' | `dark-a-2-result.png` |
| 없는 기록 영문 404 | 해결. `/analyses/vibe_nope` 404, '찾을 수 없습니다' | curl |
| force 기록 재분석 시 강행 풀림 | 해결. 플랫레이·verydark-a force → 재분석 같은 id, analyzable true, no-person/warn 유지 | `api-summary.json` |
| 흑백 전신=상반신, 아주 어두운 사진=인물 0(measure.ts) | 해결. gray-b full-body·발목 0.97/0.99·8.17등신, verydark-a 인물 1·full-body | `gray-b-1-precheck.png`, `verydark-a-2-result.png` |

회귀: look-a·look-b·dark-a 측정값이 수정 전과 같음(발목·등신 동일). 상반신 크롭 3장(컬러 2, 흑백 1)은 upper-body 유지. multi(3명 합성)는 2명 검출이지만 원본 검출부터 2명이고 주 인물 발목 0.76이라 재검출을 타지 않음(`pose-orig-vs-pad.json`). `/pocs/celeb-vibe` 307 유지. look-a 사진 대조: 핫스팟 4개 위치 맞음.

## 남은 문제 (minor)

1. 어두운 사진(dark-a, UI 측정 경로): 큰 제목은 '가을웜 딥 / Autumn Warm Deep'인데 바로 아래가 '언더톤 판정 보류', 축 요약은 '웜·쿨 보류'. 톤 이름에 '웜'이 들어 있어 같은 모순이 남는다(신뢰도 20%, 참고용 표시는 있음). 재분석에서도 같음.
2. `app/not-found.tsx`가 앱 전체 404라 `/foo` 같은 없는 주소에도 '삭제되었거나 없는 분석 기록입니다'가 나온다.

codex sol 2차 의견 `codex-sol.txt`: 4번(404 범위) 재현해 채택. 1·2번(다인원·상반신에서 재검출이 잘못 고름)은 multi·상반신 크롭으로 재현하지 않음. 3번(재검출 detect 예외 시 첫 결과 유실)은 코드상 가능하나 실제 실행에서 재현하지 않음.
