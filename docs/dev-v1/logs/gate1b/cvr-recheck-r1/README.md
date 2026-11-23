# celeb-vibe-report minor 정리 독립 재검증 라운드 1

- 일시: 2026-11-24. 대상: [cvr-minor-r1](../cvr-minor-r1.md)에 적힌 수정 6건과 dev HMR 새로고침 반복
- 서버: 3106 dev, 실제 모드(`CELEBER_AI_PROVIDER=openai`, `gpt-6.2-sol`). 공유 DB를 `VACUUM INTO`로 복사한 별도 데이터 폴더를 썼다. 끝나고 서버를 종료했다
- 판정: **PASS (major 0, minor 9)**. Codex sol 2차 의견은 [codex-sol.txt](codex-sol.txt)에 있다. 직접 재현한 항목만 채택했다

## 이전 이슈 재현 결과

| # | 이슈 | 결과 | 근거 |
|---|---|---|---|
| 1 | 색 측정 불가 사진의 입술색·원본 톤·예전 가이드 색 갭 | 부분 해결 | 팔레트의 '톤 비교 불가', 색 갭 5개 비교 불가, 예전 가이드 갭 숨김은 실제 화면에서 확인([dark-colorunusable-guide](dark-colorunusable-guide.png), [old-guide-dark-vibe](old-guide-dark-vibe.png)). 남은 것: 상세 > 판정 근거에 '가을웜 뮤트 원형에 가장 가깝습니다'가 '톤을 추정하지 않았습니다'와 함께 보인다([dark-detail-evidence](dark-detail-evidence.png)). 수정 전에 저장한 가이드의 매핑표 입술색, 분석이 지워진 예전 가이드의 색 갭은 프로브로 재현 |
| 2 | 해상도 초과 오류 문구 | 해결 | 6500×6500 PNG(136KB) → 422, "사진 해상도가 약 4000만 화소를 넘습니다…"([px6500-upload-error](px6500-upload-error.png)) |
| 3 | 인물 없음 + 조명 사유의 '연예인 룩: I라인' | 해결(규칙). AI 경로는 남음 | 실제 강행 2건에서 코디 가이드에 실루엣 문구가 없다. AI가 같은 제목을 쓰면 병합이 그대로 둔다(프로브) |
| 4 | AI 서술의 근거 밖 색 | 부분 해결 | '초록'은 걸러진다. 연두·하늘색·청록·자주·에메랄드·카멜·테라코타는 그대로 통과한다(프로브) |
| 5 | 표현만 다른 원색·보정 주의 | 부분 해결 | 실제 API 출력에 '사진의 보정 색감 그대로'와 '사진의 어두운 색감 그대로'(dd20), '화면의 색감 그대로 맞추기'(flatlay)가 함께 남았다. 무채색 룩에서 '채도 높은 상의', '강렬한 색상의 상의', '형광색 포인트'가 걸러지지 않는다(프로브) |
| 6 | 재생성 `{"skipAI":true}` | 해결 | 생성·재생성 400 `unrecognized_keys`, `skipAi:true`는 200(`aiSource: skipped`)([api-strict](api-strict.txt)) |
| - | dev HMR 새로고침 반복 | 재현 안 됨 | 새로 띄운 서버 2번에서 `/new`, `/guides`, `/`, `/pocs/celeb-vibe-report/new`를 15초씩 열어 둠. document 요청 1번, `load` 1번, 새로고침 웹소켓 메시지 0건. 가이드 화면에서 12초를 기다려도 같았다. 코드는 바뀌지 않았고 원인도 확인하지 못해 미해결로 둔다 |

## 정상 입력 (실제 API)

- look-a: 업로드 → precheck(측정 true) → 분석 `hybrid` → 가이드 `aiSource: ai`, `source: hybrid`, `isMock: false`. 상의만 라이트 베이지 → 라이트 그레이, 하의·가방은 유지, 블랙 슈즈 → 다크 브라운. 요약·코디 서술이 치환표와 맞는다([looka-guide](looka-guide.png), [api-guides.jsonl](api-guides.jsonl))
- 화면의 '다시 만들기'(실제 AI, 34.6초): 같은 id, `hybrid`([looka-regenerate](looka-regenerate.png))
- 앱 test 74 통과·6 건너뜀, typecheck 0, lint 0

## 남은 minor

1. 색 측정 불가 사진의 상세 > 판정 근거에 원본 톤 문장이 남는다(실제 화면에서 재현). 피부 스와치('딥 피부')도 남는다
2. 수정 전에 저장한 가이드: 매핑표의 입술색, 분석이 지워졌을 때의 색 갭 그래프(프로브. 수정 전 데이터에만 해당)
3. 근거 밖 색 필터가 색 단어 목록에 의존한다(#4)
4. 원색·보정 주의 묶음이 표현에 의존한다(#5, 실제 API에서 재현)
5. 새 회귀: 색 단어 오인. '와인딩'(와인), '그린 듯'(그린) 때문에 정상 AI 요약·얼굴 요약이 규칙 문장으로 바뀐다(프로브). 틀린 말은 아니고 서술만 약해진다
6. 얼굴 가까운 색 주의가 규칙과 AI에서 거의 같은 문장으로 두 번 나온다(실제 API 2건: '얼굴 가까이 … 크루넥 스웨트셔츠' / '얼굴 가까이의 … 스웨트셔츠')
7. AI 코디 항목이 '연예인 룩: I라인'을 쓰면 인물 없음 사진에도 남는다(프로브)
8. 갭 레이더 왼쪽 라벨 '체형 비율'의 첫 글자가 420px에서 잘린다([radar-label-clip](radar-label-clip.png)). `@celeber/ui` RadarChart(HOLD)
9. dev HMR 새로고침 반복: 재현되지 않았고 원인도 확인하지 못했다

프로브: [cvr-recheck-r1.probe.test.ts](../cvr-recheck-r1.probe.test.ts), [cvr-recheck-r1b.probe.test.tsx](../cvr-recheck-r1b.probe.test.tsx), 출력 [probe-output.txt](probe-output.txt)
