# celeb-vibe minor 수정 라운드 1 (2026-11-24)

대상: [critic/celeb-vibe-r3](../critic/celeb-vibe-r3.md) 앱 minor 4건 + cvr-r2의 celeb-vibe 측정 1건. 수정은 `pocs/celeb-vibe` 안에서만 했다.
검증: `next build` + `next start --port 3115`(스크래치 데이터 폴더, 끝나고 종료), Playwright 헤드리스. 실제 모드는 Anthropic 400(한도) 다음 OpenAI `gpt-6.2-sol`.

| 이슈 | 수정 | 수정 전 → 수정 후 |
|---|---|---|
| AI 문장이 내부 입력을 언급('서버 중앙값은…') | `buildVibePrompt`: 브라우저 측정이 없으면 의상 측정색·중앙 통계 노트·휴리스틱 피부색을 프롬프트에 넣지 않음. 시스템 프롬프트에 '입력 자료를 언급하지 말 것' 한 줄 | 11건 중 8건 → API 7건 + UI 3건 중 0건(앱 고정 문구 '픽셀 측정값이 아닙니다' 제외) |
| 언더톤 보류인데 축 요약이 '뉴트럴 쿨' | `result-view.tsx`: 언더톤이 없으면 첫 칸을 '웜·쿨 보류'로 | dark-a: '웜·쿨 보류 · 명도 딥 · …' (`vibe-fix-dark-a.png`) |
| 없는 기록이 영문 404 | `app/not-found.tsx` 추가(찾을 수 없습니다 + 추구미 기록 링크) | `/analyses/vibe_nope` 404, 한국어 안내 |
| 측정 없이 강행한 기록을 다시 분석하면 강행이 풀림 | `server/index.ts`: force면 측정이 없어도 kv에 저장 | 플랫레이 force: 재분석 후에도 analyzable true · no-person/warn |
| 흑백 전신 사진을 상반신으로, 아주 어두운 사진은 인물 없음(measure.ts) | 첫 포즈 검출이 실패하거나 발목 visibility < 0.5면 정사각형 여백 캔버스로 다시 찾아 나은 쪽을 씀(camera-body와 같은 방식). 순수 함수는 `lib/pose.ts` | gray-b: upper-body·발목 0.13 → full-body·0.97, 8.17등신(컬러 look-b 8.18). verydark-a: 인물 0명 → 1명 full-body. look-a·look-b·dark-a·multi는 그대로 |

테스트: `test/gate1-r3.test.ts`(프롬프트, 축 요약, not-found, 여백 좌표·선택), `test/server.test.ts`(강행 재분석). 수정 전 코드로 돌리면 3건 실패를 확인했다. test 97개, typecheck, lint 통과.
남은 것: verydark-a는 얼굴을 못 찾아 'occluded/warn(얼굴이 가려졌거나 돌아가 있어…)'이 붙는다. 극단 조명 경고와 함께 나오므로 그대로 뒀다.
