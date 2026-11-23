# Gate 1: celeb-vibe-report 입출력 검증 (구현 측)

- 일시: 2026-11-24. 검증자 판정 전 구현자 기록이다.
- 서버: `pnpm --filter @celeber/celeb-vibe-report dev` (3106), 키 있는 실제 모드(`CELEBER_FORCE_MOCK` 없음). 키는 `set -a; source .env; set +a`로만 올렸다.
- 데이터: 공유 `pocs/.data`를 `VACUUM INTO`로 복사한 별도 `CELEBER_DATA_DIR`(작업 폴더, 끝나고 버림). 공유 DB는 건드리지 않았다.
- 입력 사진: `pocs/core/fixtures/demo-people/look-a.jpg`(분석 가능), `look-b.jpg`를 흑백으로 바꾼 사진(분석 불가).

## 결과

| 항목 | 결과 | 근거 |
|---|---|---|
| `/pocs/celeb-vibe-report` 경로 | PASS (수정 후) | 수정 전 404. 지금은 `/pocs/celeb-vibe-report/<경로>?<쿼리>` → 307 `/<경로>?<쿼리>`, 따라가면 200. localhost가 아닌 Host는 403 |
| 실제 공급자 응답 | PASS | 첫 호출 Anthropic 400(사용 한도) → OpenAI `gpt-6.2-sol`. 리포트 `aiSource: ai`(20.2초), 추구미 분석 `source: ai`(22.3초), 가이드 `aiSource: ai`, `source: hybrid`, `isMock: false`(27.6초) |
| zod 계약 | PASS | `UploadRecord`, `Analyzability`, `PersonalColorReport`, `VibeAnalysis`, `VibeGuide`(생성 응답과 GET 재조회) 모두 parse 통과 |
| 내용이 사진과 맞는지 | PASS | 아래 |
| 분석 불가 → 같은 이름 검색 사진 | PASS | 흑백 사진 precheck `analyzable: false`(`heavy-filter`, error) → 안내 문구와 함께 '데모 모델' 검색 → 인물 열기 → 대표·최근·평소 갤러리. API로 갤러리 사진 하나를 분석하면 `source: ai` |
| 브라우저 측정(MediaPipe) | PASS | 헤드리스 Chromium에서도 precheck `measured: true`. 측정이 있으면 색 5축·체형 갭이 모두 계산된다(API만 쓰면 색 축은 비교 불가로 표시) |
| 앱 test / typecheck / lint | PASS | 48개 통과, live 6개는 건너뜀 / 오류 0 / 오류 0 |

### 내용 대조 (look-a)

사진: 가운데 가르마의 검은 머리, 오트밀색 드롭숄더 스웨트셔츠, 차콜 원턱 와이드 슬랙스, 회색 토트백, 검은 청키 구두.

- 분석: 상의 '크루넥 스웨트셔츠(오트밀 베이지)', 하의 '원턱/앞주름 와이드 슬랙스(차콜 그레이)', 신발 '청키 슈즈(블랙)', 가방 '소프트 토트백(웜·토프 그레이)'. 분위기 '절제된, 차분한, 도시적인'. 인물 신원 언급 없음.
- 가이드(여름쿨 트루 리포트 기준): 얼굴 가까운 상의만 라이트 그레이로 치환(ΔE 8~11), 하의·신발·가방은 원색 유지. 헤어는 '블랙 → 소프트 블랙', 가르마 정리. 행동은 쉬움 → 어려움 순서.
- 색 바꾸기 미리보기, 팔레트 비교, 레이더·막대 갭, 주의 요소가 화면에 모두 나온다.

## 고친 것 (pocs/celeb-vibe-report 안)

1. **`/pocs/...` 경로 404** → `proxy.ts`가 접근 제어를 먼저 거친 다음 `src/lib/pocs-path.ts`로 접두어를 떼고 307 리다이렉트한다. 테스트: `test/pocs-path.test.ts`.
   - `next.config.ts`의 `redirects()`로 먼저 해 봤는데, dev(Next 16.4.6)에서 HMR 연결마다 `[Fast Refresh] rebuilding` → 전체 새로고침이 반복됐다(8초에 140번). 그래서 되돌렸다. `basePath`를 쓰면 선행 플로우가 호출하는 `/api/*` 절대 경로가 깨진다.
2. **무채색을 립 색으로 옮기는 문구**: 여성 리포트의 립 항목이 '연예인 룩의 포인트 색 블랙은 … 라즈베리로 옮기면'으로 나왔다(포인트 색이 검은 구두였음). 입술 측정색이나 채도 C* ≥ 15인 색만 포인트로 쓰고, 없으면 톤별 립 추천으로 대신한다(`src/lib/rules.ts`). 테스트: `test/lib.test.ts`.
3. 실제 서버 검증 테스트 `test/live-http.test.ts`를 추가했다. `CELEBER_LIVE_URL`이 있을 때만 돈다(유료 호출).

## 스크린샷 (`shots/`, 420px, 2배율)

| 파일 | 화면 |
|---|---|
| `celeb-vibe-report-01-home.png` | `/pocs/celeb-vibe-report` → `/` 홈 |
| `celeb-vibe-report-02-new.png` | 리포트를 지정한 새 가이드 |
| `celeb-vibe-report-03-precheck.png` | 사진 올리기 → 분석 가능 판정 |
| `celeb-vibe-report-04-vibe-result.png` | 추구미 분석 결과 |
| `celeb-vibe-report-05-guide.png` | 가이드 전체 |
| `celeb-vibe-report-06-unanalyzable.png` | 흑백 사진 분석 불가 |
| `celeb-vibe-report-07-fallback-search.png` | 같은 이름 검색 결과 |
| `celeb-vibe-report-07b-fallback-gallery.png` | 그 인물의 대표·최근·평소 갤러리 |
| `celeb-vibe-report-08-guides.png` | 내 기록 |

## 제한·미해결

- **이미지 검색은 Mock이다**(NAVER·SERPAPI 키 없음). 폴백 갤러리는 데모 사진 1장과 실루엣이고, 레이아웃 상단 '데모 데이터' 배지도 이 때문에 계속 보인다. 가이드 자체의 출처 칩은 '측정 계산 + AI 서술'이다.
- **색 바꾸기 미리보기 번짐**: look-a에서 상의 box 안의 밝은 회색 배경까지 함께 바뀌어 옅은 사각형이 보인다(05-guide). README에 적힌 bbox + 색 거리 마스크의 한계다. 고치려면 인물 분할 마스크가 필요하다.
- **AI 응답 시간**: 첫 호출마다 Anthropic 400을 한 번 거친 뒤 OpenAI로 간다. 가이드 생성 20~30초, 추구미 분석 20초 안팎.
- 리포트 쪽 값(내 명도 11, 체형 9.0등신)은 기존 합성 얼굴·데모 전신 세션에서 온 값이다. 이 앱이 계산한 값이 아니다.
- 기존 얼굴 세션 하나(`face_mwtcey…`)는 처음 복사본에서 원본 업로드 파일이 빠져 리포트 서술이 Mock으로 떨어졌다. 복사를 다시 하자 정상이었다(병렬 작업과 작업 폴더 이름이 겹친 탓이다. 아래 참고).
- dev 오버레이 '2 Issues'는 MediaPipe가 `console.error`로 찍는 `INFO: Created TensorFlow Lite XNNPACK delegate` 로그다. 기능에는 영향이 없다.
- 작업 폴더 충돌: 처음에 공용 작업 폴더의 `data`, `pw` 이름을 다른 병렬 에이전트와 같이 썼다. 이후 `cvr3106/` 아래로 옮겨 다시 검증했다. 위 결과는 모두 옮긴 뒤의 실행이다.

## 제안 (다른 소유자)

- hub: PoC 링크가 `http://<host>:3106/...`로 직접 간다. `/pocs/<앱>` 경로를 쓰려면 다른 앱도 같은 proxy 리다이렉트를 두거나, Gate 2에서 한 앱으로 합칠 때 경로를 정한다.
- CORE: 없음.
