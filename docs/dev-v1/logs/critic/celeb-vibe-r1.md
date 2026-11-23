# celeb-vibe 독립 검증 라운드 1 (2026-11-24)

- 실행: 3104 dev, `CELEBER_DATA_DIR`=scratchpad 사본, FORCE_MOCK 없음. 첫 호출에서 Anthropic 400(한도) 후 OpenAI `gpt-6.2-sol`로 전환(`/api/meta` aiProvider=openai). 서버는 종료했다.
- `/pocs/celeb-vibe` 404, `/pocs/celeb-vibe/` 308→404 (`vibe-pocs-path-404.png`).

| 입력 | 경로 | 결과 |
|---|---|---|
| look-b | UI(측정+AI) | hybrid, 아이템 5개·핫스팟·색 사진과 일치 (`vibe-b-*`) |
| look-a | API만 | ai, 스웨트셔츠·슬랙스·토트백·구두 일치 |
| 플랫레이(인물 없음, gpt-image-2 생성) | UI 강행 | 코디 4개 정확. 그러나 톤 '가을웜 뮤트'+피부 견본(스웨터 색) 표시 (`vibe-noperson-*`) |
| 풍경(인물·옷 없음) | UI 강행 / API | 산·물에 '상의/하의' 핫스팟, 룩 '미니멀 블랙 룩', '여름쿨 뮤트', 'AI 분석' 표기 (`vibe-coast-*`) |
| 어두운 look-a | UI | 코디 가능 판정, 스웨트셔츠가 '딥 올리브 브라운'. '가을웜 딥'+'언더톤 쿨' 동시 표시 (`vibe-dark-*`) |
| 24MB JPEG | UI·API | 400 'Failed to parse body as FormData.' (proxy 10MB 절단, `vibe-big15-*`) |
| 52MP JPEG / HEIC / 텍스트·랜덤 | API·UI | 영문 원문 오류 / libheif 원문 / 7종 형식 안내(화면은 3종) |
| 투명 여백 PNG | precheck | '사진이 매우 어둡습니다' 오판 |
| 다시 분석 후 이름 수정 | UI | 룩 이름이 재분석 전 값으로 되돌아가고 고정됨 (`vibe-edit-after-reanalyze.png`) |
| 다시 분석 중 삭제 | API | 삭제한 기록이 새 id로 다시 생김 |

키 노출 검사 0건. codex(gpt-6.2-astra) 2차 의견: `celeb-vibe-r1-codex.txt` (재현한 항목만 채택).
