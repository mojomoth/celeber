# celeb-vibe 독립 검증 라운드 2 (2026-11-24)

- 실행: 3104 dev를 새로 띄움(`CELEBER_DATA_DIR`=scratchpad 사본, FORCE_MOCK 없음). Anthropic 400(한도) 후 OpenAI `gpt-6.2-sol`. 끝나고 종료함.
- 테스트 77/77, typecheck·lint 오류 없음. 키 노출 0건.

## 라운드 1 이슈 재확인

| 이슈 | 결과 | 근거 |
|---|---|---|
| 10MB 넘는 업로드 | 해결. 24MB JPEG API 200, UI 분석까지 hybrid | `vibe-r2-big15-*` |
| 인물 없는 사진 채움 | 해결. 풍경: 아이템·톤·팔레트 비움. 플랫레이: 아이템 4개 정확, 톤 없음 | `vibe-r2-coast-2-result.png`, `vibe-r2-flatlay-2-result.png` |
| `/pocs/celeb-vibe` | 미해결. 404 (다른 앱 4개는 next.config로 해결함) | `vibe-r2-pocs-path-404.png` |
| 업로드 오류 원문(core) | 미해결. 52MP 'Input image exceeds pixel limit', 텍스트 파일 7종 안내 | `vibe-r2-hugepx-1-precheck.png`, `vibe-r2-text-1-precheck.png` |
| 어두운 사진 톤·언더톤 | 해결. '언더톤 판정 보류 · 참고용', 아이템에 노출 부족 노트 | `vibe-r2-dark-2-result.png` |
| 재분석 후 이름 수정 | 해결. 폼에 새 룩 이름, 저장 후 유지 | `vibe-r2-edit-after-reanalyze.png` |
| 재분석 중 삭제 | 해결. reanalyze 404 '분석하는 동안 기록이 삭제됐습니다.' | - |
| 투명 PNG | 해결. precheck에 extreme-lighting 없음 | - |

## 새로 확인한 문제 (모두 minor)

1. 측정 없는 API 분석에서 AI가 톤을 비워도 `partial.personalColor=true`. 상세 화면은 '모두 분석할 수 있습니다'와 '톤을 추정하지 않았습니다 · 0%'를 함께 보여 준다(`vibe-r2-api15mb-detail.png`). 톤을 준 경우(신뢰도 0.28)는 사유가 지워져 목록에 '(참고용)'이 붙지 않는다.
2. 플랫레이 스웨터 노트에 '측정색 블랙(#0A0E12)과 차이가 있습니다(조명 영향 가능)'. 측정 없는 경로의 중앙 픽셀 초안을 측정색으로 부른다.
3. 측정 없이 AI가 2명을 issues에 직접 적으면 warn으로 낮아져 analyzable=true, 적지 않으면 error(`mergeAnalyzability` 직접 실행으로 재현).
4. AI 문장 말투가 섞인다. 실루엣·요약·근거 일부가 '~다.', 나머지는 '~습니다.'(`vibe-r2-a-2-result.png`).
5. 인물 없는 사진 강행 시 사유 '사진 중앙을 인물로 가정하고 사진 통계로 분석했습니다'인데 결과는 비어 있고, 컬러 팔레트 섹션은 빈 상태 문구 없이 제목만 남는다.

codex(gpt-6.2-astra) 2차 의견: `celeb-vibe-r2-codex.txt`. 1~5번 중 재현한 것만 채택, 6·8~10번은 재현하지 않음.
