# Gate 1 UI 목업 통합 검증 (2026-11-24)

사용자 지시로 HIL은 통과 처리했고, v4 시안 기준 목업(`pocs/ui/mockup`, 포트 3107)을 통합 검증했다. 결과: **PASS**. blocker·major는 남지 않았다.

## 화면별 일치도

일치도는 각 화면 검증 에이전트가 원본 PNG와 실제 화면을 비교해 매긴 점수다. 차이 픽셀은 이번에 다시 찍은 `-full` 스크린샷(390pt, DPR 2)과 `docs/ui/drafts/v4/NN-*.png`를 겹쳐, 밝기 차가 40을 넘는 픽셀 비율을 잰 값이다(겹치는 높이까지만).

| 화면 | 경로 | 일치도 | 차이 픽셀 | 높이 (실제 / 시안, @2x) |
|---|---|---|---|---|
| 01 랜딩 | `/` | 93 | 0.45% | 1688 / 1688 |
| 02 촬영 | `/capture` | 96 | 0.28% | 1688 / 1688 |
| 03 내 분석 | `/analysis` | 96 | 0.76% | 3060 / 3062 |
| 04 퍼스널컬러 | `/personal-color` | 95 | 2.90% | 8254 / 5020 (리포트 카드 기준 섹션 추가) |
| 05 추구미 | `/muse` | 94 | 2.29% | 4564 / 4568 |
| 06 내 기록 | `/library` | 97 | 0.71% | 2658 / 2660 |

## 이번에 한 일

공용 컴포넌트 정리 (동작은 그대로)
- `BottomSheet` 추가(`src/ui/BottomSheet.tsx`). 스크림, 아래 시트, Esc·바깥 누르기 닫기, 열릴 때 초점 이동을 한곳에 모았다. `Dialog`와 05 `SearchSheet`가 이것을 쓴다. 05에 따로 있던 스크림·패널 CSS와 키 처리 코드를 지웠다. 부모가 다시 그려져도 초점이 다시 옮겨지지 않게 `onClose`는 ref로 들고 있다.
- `RadioMark`에 `display: block`을 넣어 26px 크기가 어디서나 잡히게 했다. 05의 우회 코드(`.mark { display: flex }`)를 지웠다.
- `Swatch`에 `labelTone='muted'`(간격 6, 400, 회색)를 추가하고 03의 덮어쓰기 CSS를 지웠다.
- `scripts/cdp.mjs`로 Chrome 제어 코드를 떼어 `shot.mjs`와 새 `flow.mjs`가 함께 쓴다. 이미지·폰트 대기(settle)에 8초 제한을 넣어, 빌드가 깨졌을 때 스크립트가 멈추지 않는다.

한 화면에서만 쓰여 공용으로 올리지 않은 것: 01 아이보리 시작 버튼, 02 단계 숫자, 04 드레이프 캡션·회피 목록·신뢰도 막대. Gate 2에서 두 번째로 쓰일 때 올린다.

화면 수정 (모두 minor)
- 03: 제목·본문 줄 사이에 공백을 넣어 스크린 리더가 '피부와긴'처럼 붙여 읽지 않게 했다. 화면 모양은 같다.
- 02: 사진 올리기 이름(`aria-label`)을 label에서 input으로 옮겼다.
- 02: 얼굴 타원을 카드 높이에 맞춰 줄인다(`top: min(62px, 14.5%)`, `height: min(206px, 62%)`). 390×844에서는 시안과 같고, 360×640에서 타원 아래가 잘리지 않는다.
- 01: 하드코딩 색을 화면 전용 CSS 변수(`--landing-bg`, `--ivory` 등)로 옮겼다.

## 전체 흐름 검증

`node pocs/ui/mockup/scripts/flow.mjs` (production 빌드, `next start`). 실제 마우스·키 입력으로 넘기며, 누를 때마다 다른 요소가 덮고 있지 않은지(elementFromPoint), 가로 넘침, 콘솔 오류·경고를 확인한다.

결과: **96/96 PASS** (모바일 48, 데스크톱 48, Codex 리뷰 반영 뒤 다시 돌린 결과). 원문은 [gate1-ui/flow.log](gate1-ui/flow.log).

| # | 단계 | 확인한 것 |
|---|---|---|
| 01 | 랜딩 | 데스크톱은 목업 프레임 안, 모바일은 프레임 없음 |
| 02–05 | 시작하기 → 촬영 | 2/4에서 시작, `?step=1` 환경 → 셔터로 2/4·3/4·4/4, 4/4에 올리기·건너뛰기 표시 |
| 06 | 건너뛰기 → 내 분석 | 경로, 하단 내비 활성 탭 |
| 07–08 | 퍼스널컬러 보기 → 퍼스널컬러 | 의상색을 누르면 선택이 하나만 옮겨 간다 |
| 09–11 | 추구미 찾기 → 추구미, 검색 시트 | 입력란 초점, '한서도' 결과, 없는 이름 안내, Esc로 닫힘 |
| 12 | 사진 올리기 | 분석 불가 안내에 올린 사진(blob) 표시 |
| 13 | 다시 고르기 | '최근 룩' 선택 → 안내 문구 바뀜, 다른 룩 보기, 가이드 저장 → '저장했어요' |
| 14 | 하단 내비 → 내 기록 | 내려 둔 스크롤이 맨 위로 돌아옴 |
| 15–16 | 분석 정보 초기화 | 대화상자 초점은 '취소', 뒤쪽 하단 내비 inert, Tab이 대화상자 안에서 돎, Esc로 닫히면 초점이 연 버튼으로, 다시 열어 '지우기' → 랜딩 |
| — | 내 기록 링크 | 가이드 보기 → 추구미, 퍼스널컬러 카드 → 퍼스널컬러, 내 분석 결과 다시 보기 → 내 분석 |
| 17 | 하단 내비 왕복 | 4탭을 스크롤한 상태에서 차례로 눌러 활성 탭과 맨 위 복귀 확인 |

스크린샷 (png는 로컬 전용, .gitignore)
- 흐름: `docs/dev-v1/logs/gate1-ui/flow/mobile/01-landing.png` … `17-nav-roundtrip-analysis.png` (780×1688), `flow/desktop/` 같은 이름 (1440×900)
- 화면별: `docs/dev-v1/logs/gate1-ui/shots/NN-<화면>-{mobile,full,desktop}.png`

## 빌드·테스트 (루트)

| 명령 | 결과 |
|---|---|
| `pnpm typecheck` | exit 0 ([typecheck.log](gate1-ui/typecheck.log)) |
| `pnpm lint` | exit 0, 오류·경고 0 ([lint.log](gate1-ui/lint.log)) |
| `pnpm test` | exit 0. core 145, hub 5, camera-body 101, search-celeb 56, celeb-vibe 97, camera-face 59, personal-color-report 57, celeb-vibe-report 74 통과. 건너뜀은 실제 키가 필요한 live 테스트 ([test.log](gate1-ui/test.log)) |
| `pnpm build:all` | exit 0. 기존 7개 앱과 목업까지 8개 모두 `next build` 성공 ([build.log](gate1-ui/build.log)) |
| `node scripts/sync-public.mjs --all` | exit 0 (목업 포함) |
| 키 노출 | `.env` 6개 키 값으로 `pocs/ui/mockup`(.next 포함)과 이 로그 폴더를 검색, 일치 0 |

기존 PoC 앱 회귀: 테스트 수와 빌드 결과가 Gate 1 마감([gate1-close.md](gate1-close.md))보다 줄지 않았다. `@celeber/ui`의 export·tsconfig는 바꾸지 않았다(eslint는 `mockup/**` 무시, test는 `src`만).

## Codex 2차 리뷰

`codex exec -m gpt-6.2-sol -s read-only`로 1회 받았다. 원문: [critic/ui-mockup-codex.txt](critic/ui-mockup-codex.txt). 결과 major 2, minor 8.

| 지적 | 처리 |
|---|---|
| [major] 모달이 열려도 Tab이 배경으로 빠지고, 닫을 때 초점이 돌아오지 않는다 | 고침. `BottomSheet`가 열린 동안 같은 화면의 나머지 요소를 `inert`로 막고, Tab을 시트 안에서 돌리고, 닫히면 연 요소로 초점을 돌린다. Dialog·검색 시트 모두 적용. flow.mjs에 확인 3개 추가 |
| [major] 내 기록의 이윤아·김도영·서이안 카드도 한서도 가이드(`/muse`)로 간다 | 고치지 않음. 목업 데이터에 가이드가 한서도 한 명뿐이고, 화면 계약이 '가이드 보기·타일 → muse'로 정했다. 인물별 가이드는 Gate 2에서 데이터와 함께 붙인다 |
| [minor] 05 올린 사진 blob URL이 화면을 떠날 때 해제되지 않고, 상태 갱신 함수 안에서 만들어진다 | 고침. ref로 들고 교체·언마운트 때 해제 |
| [minor] 어두운 촬영 화면에서 초점 테두리가 안 보인다 | 고침. `.screenDark`에서 흰 테두리 |
| [minor] 05 썸네일 3–6을 고르면 비교 타일에 대표 룩 설명이 남는다 | 고침. 대응하는 룩이 없으면 설명을 비운다 |
| [minor] cdp.mjs: 연결이 끊기거나 응답이 없으면 멈춘다, 시간 초과된 리스너가 남는다 | 고침. 끊기면 대기 요청을 실패시키고, 요청마다 60초 제한, 리스너 정리·복사본 순회 |
| [minor] flow.mjs '한서도' 검색 결과 확인이 '사진으로 찾기' 버튼에도 맞는다 | 고침. 결과 버튼에 '한서도'가 있는지 본다 |
| [minor] shot.mjs `--only` 오타를 줘도 성공으로 끝난다 | 고침. 잘못된 값이면 종료 코드 2 |
| [minor] `pnpm sync:public`에 목업이 빠져 있다 | 고침. `scripts/sync-public.mjs` ALL_APPS에 `ui/mockup` 추가 |

Codex를 백그라운드로 처음 돌렸을 때 표준 입력을 기다리며 멈췄다. `< /dev/null`을 붙여 다시 돌렸다.

## 남은 minor

- 01 상태 표시줄·홈 인디케이터: 공용 `Screen`이 03–06 기준이라 01 원본보다 9:41이 약 15pt 오른쪽, 인디케이터가 조금 넓다(sim·프레임 화면에서만 보임). 화면 간 일관성을 위해 그대로 둔다.
- 01 배경: 원본 사진이 없어 v3 PNG를 가공했다. 버튼 뒤 띠는 질감이 없다. Gate 2에서 Codex image_gen으로 새로 만든다.
- 02: 자세 예시가 모든 단계에서 정면 사진 하나다. 전신(4/4) 카드에서 contain 사진과 흐린 배경 경계가 좁은 화면에서 살짝 보인다. 데스크톱 프레임(카드 477)에서는 얼굴이 타원보다 조금 크다.
- 03·05·06: 전체 높이가 시안보다 1–2pt 짧다(줄 높이 반올림). 눈으로는 보이지 않는다.
- 04: 리포트 카드 기준으로 더한 섹션이 위의 스타일 가이드 요약과 내용이 겹친다(87% 두 번, '피할 스타일'과 '피하면 좋은 스타일'). 추가 섹션 문구는 직접 쓴 목업 문구라 디자인 검토가 필요하다.
- 05: 다른 룩을 골라도 가이드 본문·팔레트·스타일링 포인트는 대표 룩 내용 그대로다(룩별 가이드 데이터 없음). 검색 인물은 한서도 한 명뿐이다.
- 06: 내 기록의 네 카드가 모두 한서도 가이드로 간다(Codex major, 목업 데이터 한계로 보류).
- 무동작 버튼: 03·04 공유, 04 리포트 저장, 06 편집. 시안·계약에 동작이 없다.
- 대화상자가 열리면 '취소'에 초점 링이 보인다. 접근성 때문에 일부러 둔다.
- 사진은 `<img>`라 next/image 최적화를 쓰지 않는다(정적 JPEG 2.3MB).
- 데스크톱 프레임 크기 계산에 `tan(atan2())`를 써서 오래된 브라우저(Chrome 111 미만, Safari 15.4 미만)에서는 1배로 표시된다.
- 병렬 검증 때 여러 에이전트가 같은 `.next`에 빌드해 서로의 서버를 깨뜨렸다. 검증은 빌드 하나·서버 하나로 돌린다.
- `pocs/ui/mockup/AGENTS.md`는 `next dev`가 만든 파일이다. 다른 PoC처럼 커밋한다.

## 다시 돌리는 법

```sh
cd pocs/ui/mockup && pnpm build && pnpm start      # 3107
node pocs/ui/mockup/scripts/flow.mjs               # 루트에서. 흐름 검증 + flow/ 스크린샷
node pocs/ui/mockup/scripts/shot.mjs all           # 화면별 mobile/full/desktop
```
