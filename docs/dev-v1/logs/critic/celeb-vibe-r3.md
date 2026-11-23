# celeb-vibe 독립 검증 라운드 3 (2026-11-24)

- 실행: 3104 dev를 새로 띄움(`CELEBER_DATA_DIR`=scratchpad 사본, FORCE_MOCK 없음). Anthropic 400(사용 한도) 후 OpenAI `gpt-6.2-sol`로 넘어감(`/api/meta` aiProvider=openai). 끝나고 종료함.
- 테스트 89/89, typecheck·lint 오류 없음. 키 노출 0건(dev 로그·결과 JSON·critic 폴더 검사).
- 실제 호출: API 6건(측정 없음), UI 5건(MediaPipe 측정, hybrid 3건), 재분석 3건, force 1건. 모두 isMock=false, 데모 배지 0.

## 라운드 2 이슈 재확인

| 이슈 | 결과 | 근거 |
|---|---|---|
| `/pocs/celeb-vibe` | 해결. 307 → `/`, `/analyses`·쿼리 유지, 브라우저 200 | `vibe-r3-pocs-path.png` |
| 측정 없는 경로 퍼스널컬러 상태 | 해결. 톤 없으면 partial.personalColor=false, 낮은 신뢰도 톤은 '(참고용)' | `vibe-r3-api-a-detail.png`, `vibe-r3-list.png` |
| 측정색 비교 노트(앱이 붙이는 문장) | 해결. 측정 없는 경로에서 앱 노트 없음 | `out/an-noperson-flatlay.jpg.json` |
| AI 여러 명 severity | 해결(단위 테스트로 확인) | `test/gate1-r2.test.ts` |
| 말투 섞임 | 해결. 이번 11건 모두 합니다체 | `vibe-r3-a-2-result.png` |
| 강행 결과 빈 팔레트 | 해결. '분석할 색이 없습니다', 사유 '보이는 부분만 분석했습니다' | `vibe-r3-coast-2-result.png` |
| 업로드 오류 원문(core) | 미해결. 52MP 'Input image exceeds pixel limit', 텍스트 파일 7종 안내 | `vibe-r3-hugepx-1-precheck.png`, `vibe-r3-text-1-precheck.png` |

## 사진 대조

- look-a(UI): 라이트 베이지 스웨트셔츠, 차콜 앞주름 와이드 슬랙스, 블랙 청키 슈즈, 웜 그레이 토트백. 핫스팟 위치 일치.
- look-b(API): 선바이저, 그래픽 티·쇼츠, 골지 양말, 스니커즈. 일치.
- 플랫레이: 니트·데님·벨트·스니커즈 4개, 톤 없음. 일치. 풍경: 아이템·톤·팔레트 비움.
- 어두운 사진: 아이템 4개 맞음, 노출 부족 노트, 퍼스널컬러 참고용.
- 퍼스널컬러(HIL 대상): look-a 측정 경로는 규칙 '봄웜 브라이트' 65%, AI '가을웜 딥'. 불일치는 접힌 근거에만 보인다.

## 새로 확인한 문제 (모두 minor)

1. AI 문장이 내부 입력을 언급한다. 11건 중 8건: '서버 중앙값은 블랙이지만', '제공된 차콜 측정값과 달리', '서버의 상·하의 색상값은 풍경 영역에서 추출된 값', '제공된 피부색 측정값은…'. 측정 없는 경로에서 중앙 픽셀 초안을 `measuredColor`로 프롬프트에 넣기 때문(build.ts 158~172).
2. 어두운 사진: 헤더는 '언더톤 판정 보류'인데 축 요약 줄은 '뉴트럴 쿨 · 명도 딥'(result-view.tsx 213).
3. 없는 기록 상세 `/analyses/<없는 id>`가 Next 기본 영문 404. 다른 앱 3개에는 not-found.tsx가 있다.
4. 측정 없이 force=true로 분석한 기록을 다시 분석하면 강행이 풀린다. 플랫레이: analyzable true·no-person warn → 재분석 후 false·error(server/index.ts 143, measurement 있을 때만 force 저장).

codex(gpt-6.2-astra) 2차 의견: `celeb-vibe-r3-codex.txt`. 1·2·6·7·8번 재현해 채택, 4·5번은 실호출에서 재현하지 않음.
