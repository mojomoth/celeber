# Gate 1 celeb-vibe 수정 라운드 1 (2026-11-24)

| # | 이슈 | 수정 | 확인 |
|---|---|---|---|
| 1 | 10MB 넘는 업로드 실패 | `next.config.ts` `experimental.proxyClientMaxBodySize = 40MB` (core `MAX_UPLOAD_BODY_BYTES` 약 36MB 이상) | `test/config.test.ts`. dev 서버에서 24.6MB JPEG `POST /api/uploads` → 200, 'exceeded 10MB' 로그 없음 |
| 2 | 인물 없는 사진에 규칙 초안 값이 'AI 분석'으로 채워짐 | `build.ts`: 측정 없는 경로에서 AI가 비운 톤·피부·헤어·눈을 초안으로 되살리지 않음. 인물 없음·사진 아님 확정 시 비측정 톤·피부 비움. 코디/분위기 불가면 아이템·키워드·팔레트·룩 이름·분위기를 초안으로 채우지 않음(룩 이름은 '인물이 없는 사진' 등). 가능할 때 채운 아이템엔 '규칙 추정' 노트 | `test/gate1-r1.test.ts`. 실 AI(폴백 모델)로 원단 견본 사진 API 분석: items [], 톤·피부 없음, 신뢰도 0, 근거 'AI가 사진에서 피부색과 톤을 판단하지 않았습니다.' |
| 3 | `/pocs/...` 경로 404 | 손대지 않음. 7개 앱 공통 방식은 오케스트레이터 결정 | - |
| 4 | 어두운 사진 톤·언더톤 모순, 어두운 옷 색 | `rules.ts reconcileUndertone`: 계절과 언더톤이 반대면 언더톤 보류 + 신뢰도 −0.1. 노출 부족이면 사유 문구와 아이템 노트 추가. 결과 화면은 '언더톤 판정 보류' 표시 | `test/gate1-r1.test.ts` |
| 5 | 재분석 후 이름 수정이 룩 이름을 되돌림 | `detail-client.tsx`: 편집 열 때 현재 값으로 다시 채움, `editPatch`로 바뀐 필드만 PATCH | `test/gate1-r1.test.ts` (`editPatch`) |
| 6 | 재분석 중 삭제 → 새 id로 부활 | `server/index.ts`: replaceId 행이 없으면 404. 상세 화면은 재분석 중 삭제·이름 수정 비활성 | `test/server.test.ts`. HTTP: reanalyze 2초 뒤 DELETE 200 → reanalyze 404 '분석하는 동안 기록이 삭제됐습니다.', 목록 4 → 3 |
| 7 | 투명 PNG를 '매우 어둡다'로 판정 | `stats.ts`: 알파 128 미만 픽셀은 통계에서 제외, 반투명은 흰 배경 합성 | `test/gate1-r1.test.ts`, `test/server.test.ts`. HTTP precheck 사유 ['other']만 |
| 8 | 상태 문구 불일치 | 목록 톤에 '(참고용)'(`toneReferenceOnly`), 측정 없을 때 비교 문구 '색 규칙 추정', 검출기 정상 0명은 '인물 0명'(`statsOnly`) | `test/gate1-r1.test.ts` |

검증: `pnpm test` 5 files / 77 tests PASS, `typecheck` PASS, `lint` PASS. dev 서버(3104) 종료 확인.
