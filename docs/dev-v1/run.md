# 실행 상태 (run)

개발 진행을 통제하는 단일 문서다. 기술 검증 결과와 결정 근거는 [report.md](report.md), 문서 목록은 [wiki/index.md](../wiki/index.md)에 있다.

- 갱신: 2026-11-26
- 현재 단계는 **Gate 2 자동 검증 PASS, HIL 대기**다. Gate 3의 운영 설정은 준비했고 Render 배포는 비용 승인 대기다.
- 루프: Plan → Build → Independent Critic → Fix → Recheck → PASS ([gauntlet-loop 적용법](../wiki/tools.md))

## 게이트 통과 조건

원문은 [PROMPT_V0.md](../prompts/PROMPT_V0.md)다.

| 게이트 | 통과 조건 |
|---|---|
| 0 준비 | 기존 프로젝트·제공 파일 확인, Codex CLI·Claude CLI 실행, 오케스트레이션 준비, 모델·API 접근 확인, 개발 서버 실행, 최소 API 계약 정의, 하네스 생성 |
| 1 PoC | [POC.md](../POC.md) 핵심 기능을 실제로 검증, `/pocs/...` 경로 접근, 실제 API 호출, PoC별 입출력 검증, 실패·제한 기록. UI 목업은 `pocs/ui`에서 개발하고 HIL 검증을 거친다. 독립 PoC는 병렬로 진행한다 |
| 2 통합 | 랜딩부터 목록까지 전체 화면 이동, HIL을 통과한 PoC 기능 통합, HIL 시퀀스·함수 입출력을 그림 위주의 간단한 문서로 확인. PoC 코드는 재사용하거나 ponytail 기준으로 리팩터링한다 |
| 3 완성·배포 | 원본 디자인과 실제 화면 비교, 모바일·데스크톱 검증, 핵심 인터랙션 동작, 불필요한 UI·코드 제거, 빌드·주요 테스트 통과, API 키 노출 검사, 배포 성공, 배포 URL에서 핵심 시나리오 재검증, 배포 환경 제약(파일 저장·실행 시간·브라우저 권한) 확인 |

## Gate 0: PASS

독립 검증 3라운드에서 major 0건, minor 4건으로 통과했다. minor 4건(api-contract의 `aiSource` 범위, 제공 파일 확인 근거, Anthropic 차단 기록 중복, log 종류 규칙)은 Gate 1 마감 때 고쳤다.

| 항목 | 상태 | 근거 |
|---|---|---|
| 기존 프로젝트·제공 파일 확인 | PASS | 환경·키 이름·.gitignore는 [gate0-devserver](logs/gate0-devserver.md), 제공 파일 범위는 [wiki/index.md 원본](../wiki/index.md#원본-읽기-전용) |
| Codex CLI·Claude CLI 실행 | PASS | [report.md](report.md#cli), [gate0-probe](logs/gate0-probe.md#cli) |
| 오케스트레이션 준비 | PASS | 워크플로 하네스가 하위 에이전트를 병렬로 돌린다 |
| 모델·API 접근 확인 | PASS | [report.md](report.md#api). Anthropic 차단은 [미해결](report.md#미해결) |
| 개발 서버 실행 | PASS | [gate0-devserver](logs/gate0-devserver.md) |
| 최소 API 계약 | PASS | [wiki/api-contract.md](../wiki/api-contract.md) |
| 하네스 생성 | PASS | 이 문서, report.md, wiki/index.md, wiki/log.md |

## Gate 1: PASS

판정 규칙: 모든 PoC와 core·AI 공급자 체인이 PASS(minor만 남음)이면 자동 검증 PASS다. 게이트 통과에는 HIL 판정과 UI 목업 검증이 더 필요하다. 2026-11-24 사용자가 직접 "HIL은 통과하고 UI랑 계속 진행해"라고 지시해 HIL을 PASS로 올렸고, 이어서 UI 목업을 만들고 검증했다.

### 공통 항목

| 항목 | 상태 | 근거·비고 |
|---|---|---|
| 실제 API 호출 | PASS | Anthropic → OpenAI(`gpt-6.2-sol`) → Mock. 각 PoC에서 `source: 'ai'`·`hybrid` 확인. [gate1-ai](logs/gate1-ai.md) |
| AI 공급자 체인(`ai.ts`·`env.ts`) | PASS | Codex sol 포함 독립 재검증 r2, major 0·minor 8. [ai-chain-review-r2](logs/gate1b/ai-chain-review-r2.md) |
| core 공용 수정 | PASS | 회귀·data URL 오류 수정 후 재검증 r2, major 0·minor 5. [core-dataurl-r2-verify](logs/gate1b/core-dataurl-r2-verify.md) |
| 이미지 검색 실제 공급자 | 당시 BLOCKED | Gate 2에서 OpenAI 이미지 검색으로 실제 사진을 검증했다. [검증 결과](report.md#gate-2-통합) |
| `/pocs/<앱>` 경로 | PASS | 6개 PoC 모두 307로 앱 경로에 연결. 각 PoC 로그 참고 |
| 빌드·테스트·키 노출 | PASS | [gate1b/close](logs/gate1b/close.md) |
| UI 목업 (`pocs/ui/mockup`, v4 시안) | PASS | 아래 [UI 목업 결과](#ui-목업-결과) |
| HIL 검증 | PASS | 2026-11-24 사용자 직접 지시 "HIL은 통과하고 UI랑 계속 진행해" |
| 커밋·푸시 | PASS | origin `mojomoth/celeber`(공개) `main`. Gate 1 마감 커밋까지 푸시 |

### PoC별 결과

입출력 검증은 구현 측, 재검증은 새 컨텍스트의 독립 검증자(Claude + Codex sol 2차 의견)가 맡았다. minor 원문은 재검증 로그에 있다.

| PoC | 입출력 검증 | 재검증 | 판정 | 남은 이슈 (모두 minor) | 로그 |
|---|---|---|---|---|---|
| camera-face | PASS | PASS | PASS | 3: 조작된 랜드마크 미검증, 서버 yaw 범위가 브라우저 값을 깎음, core ROI 상한으로 낮아진 신뢰도 | [재검증](logs/gate1b/camera-face-recheck-r1.md) |
| camera-body | PASS | PASS | PASS | 4: ±10° 기울기 판정 비대칭, 요약 칩 반올림 차이, 무릎 하나 가려진 앉은 사진, 딱 맞는 모자 경고 없음 | [재검증](logs/gate1b/cb-recheck-r2/README.md) |
| search-celeb | PASS | PASS | PASS | 4: 설명 없는 행이 후보를 흡수, 동명이인 검색어 2·3번째 동일, `cleanRole` 오인식, 데모 안내 중복 | [재검증](logs/gate1b/search-celeb-recheck-r1.md) |
| celeb-vibe | PASS | PASS | PASS | 2: 언더톤 보류인데 톤 이름에 '웜', 앱 전체 404 문구가 기록 전용 | [재검증](logs/gate1b/cv-recheck-r1/README.md) |
| personal-color-report | PASS | PASS | PASS | 5: ⑭ ROI 누락 안내 잘림·문장 모순, 업로드 중단·text/plain 문구, 마침표 중복 | [재검증](logs/gate1b/pcr-minor-recheck-r1.md) |
| celeb-vibe-report | PASS | PASS | PASS | 9: 색 측정 불가 근거 문장, 예전 가이드, 색 단어 필터 누락·오인식, 중복 주의 문구, 레이더 라벨 잘림(`@celeber/ui`), dev HMR 미재현 | [재검증](logs/gate1b/cvr-recheck-r1/README.md) |

### UI 목업 결과

`pocs/ui/mockup`(패키지 `@celeber/ui-mockup`, 포트 3107, `/pocs/ui` → `/` 307). v4 시안 6화면을 `src/screens/<NN-name>/`로 나누고 목업 데이터는 `src/data/mock.ts`에서 props로 넣는다. `@celeber/ui`의 export·동작은 바꾸지 않았다(eslint는 `mockup/**` 무시, test는 `src`만). 상세와 남은 minor는 [gate1-ui](logs/gate1-ui.md)에 있다.

| 화면 | 경로 | 일치도 | 차이 픽셀 | 판정 |
|---|---|---|---|---|
| 01 랜딩 | `/` | 93 | 0.45% | PASS |
| 02 촬영 | `/capture` | 96 | 0.28% | PASS |
| 03 내 분석 | `/analysis` | 96 | 0.76% | PASS |
| 04 퍼스널컬러 | `/personal-color` | 95 | 2.90% (리포트 섹션 추가분) | PASS |
| 05 추구미 | `/muse` | 94 | 2.29% | PASS |
| 06 내 기록 | `/library` | 97 | 0.71% | PASS |

- 일치도는 화면별 검증 에이전트가 원본 PNG와 실제 화면을 비교해 매긴 점수, 차이 픽셀은 시안 PNG와 겹쳤을 때 밝기 차 40 초과 비율이다.
- 전체 흐름(production 빌드): 96/96 PASS(모바일 390×844 48, 데스크톱 프레임 1440×900 48), 콘솔 오류·경고 0. [flow.log](logs/gate1-ui/flow.log)
- Codex sol 2차 리뷰: major 2, minor 8. major 1(모달 초점·inert)과 minor 8은 고쳤다. major 1(06의 네 카드가 모두 한서도 가이드로 감)은 목업 데이터 한계라 Gate 2로 미뤘다. [ui-mockup-codex](logs/critic/ui-mockup-codex.txt)

**HIL 처리:** 이후 게이트에서도 HIL이 필요한 항목은 "HIL 대기"로 표시하고, 사용자 판정이 나오기 전에는 PASS로 바꾸지 않는다. HIL 대기 항목이 있어도 그와 무관한 작업은 계속한다.

## TODO

Gate 1
- [x] OpenAI 대체 공급자 추가, 실제 호출 ([gate1-ai](logs/gate1-ai.md))
- [x] PoC 6개 입출력 검증과 독립 critic(병렬)
- [x] `/pocs/...` 경로 접근
- [x] core 공용 수정과 재검증(회귀·data URL 포함)
- [x] camera-body 정수리 major 수정과 재검증
- [x] AI 공급자 체인 Codex sol 독립 리뷰와 수정
- [x] PoC별 minor 1차 정리와 재검증
- [x] 빌드·테스트·키 노출 재검사, 커밋
- [x] 사용자 HIL 판정 (2026-11-24 PASS)
- [x] UI 목업 v4 6화면, 전체 흐름 검증, Codex 2차 리뷰 ([gate1-ui](logs/gate1-ui.md))

Gate 2
- [x] `apps/web`에서 v4 화면과 PoC Route Handler 재사용
- [x] 실제 촬영·전신 분석·퍼스널컬러·추구미·내 기록 연결
- [x] OpenAI 이미지 검색과 실제 사진 검증
- [x] 인물·사진별 가이드와 촬영 단계별 예시 적용
- [x] Codex `image_gen`으로 랜딩 배경 제작
- [x] 얼굴 좌표 입력 범위 보강, AI 동시 차단 상태 재확인, 설정 오류 로그에서 입력값 제거
- [x] [HIL 시퀀스·함수 입출력 문서](../wiki/integration-flow.md)
- [x] 독립 검증, 빌드·테스트·키 노출 검사, 커밋·푸시
- [ ] 사용자 HIL 판정

Gate 3
- [x] Render용 단일 사용자 접속 제어, 영구 디스크 설정
- [ ] Render 인스턴스 생성 및 배포 URL 검증

## 결정 기록

사용자 결정이 필요했던 4건의 처리 결과다.

1. **HIL 판정: PASS.** 2026-11-24 사용자 직접 지시("HIL은 통과하고 UI랑 계속 진행해").
2. **UI 목업 v4: 진행, PASS.** 같은 지시. `@celeber/ui`와 분리해 `pocs/ui/mockup`에 별도 앱으로 두었다.
3. **공개 범위: 현행 유지.** 사용자 응답이 없었다. 데모 사진(`pocs/core/fixtures/demo-people`), `docs/ui/refs` 레퍼런스 이미지, 목업 인물 사진(생성 이미지)은 공개 저장소에 그대로 둔다. 사용자가 비공개를 원하면 그때 뺀다.
4. **이미지 검색 대체: OpenAI `web_search`를 Gate 2에서 대체 공급자로 붙인다.** 오케스트레이터 결정. 근거: Google Custom Search는 이 키로 401(OAuth 필요), Gemini 검색 그라운딩은 429, `NAVER_*`·`SERPAPI_API_KEY`는 없다. OpenAI 키는 이미 비전 호출에 쓰고 있고, 시험 호출에서 실제로 열리는 이미지 URL을 돌려줬다(1개). 결과 품질은 아직 확인하지 않았으므로 Gate 2에서 실제 사진으로 검증하고, 실패하면 지금처럼 Mock으로 떨어진다. PROMPT_V0의 '선택이 필요하면 스스로 결정하고 근거를 기록' 원칙에 따랐다.

## 역할과 파일 소유권

구현자와 검증자는 같은 작업 단위에서 겹치지 않는다. 검증자는 새 컨텍스트에서 시작하고 실제 화면과 실제 응답을 본다.

| 역할 | 에이전트·모델 | 담당 | 쓰기 권한 |
|---|---|---|---|
| 오케스트레이터 | celeber-ca 세션 (2026-11-24 인계, Claude opus-5-5) | 계획, 작업 배분, 게이트 판정, 커밋 | `docs/dev-v1/run.md`, `.gitignore` |
| 구현자 | Claude CLI `claude-opus-5-5` | 서버·인터페이스 구현, 비주얼 정리 | 배정받은 `pocs/<앱>/` 하나. `pocs/core`는 한 번에 한 에이전트만 |
| 분석·외형 검증자 | Claude CLI `claude-sonnet-5-5` | 이미지 분석, 원본 디자인과 실제 화면 비교, 응답 검증 | 읽기 전용. 결과는 `docs/dev-v1/logs/` |
| 이미지 생성·수정 | Codex CLI `gpt-6.2-astra` (`image_gen` 도구) | 배경·에셋 생성과 수정 | `assets/` 아래 새 파일. `assets/bi`, `assets/mockup` 원본은 읽기 전용 |
| 2차 독립 리뷰 | Codex CLI `gpt-6.2-sol` (깊은 검토는 `gpt-6.2-astra`) | 코드 리뷰, 계약 위반·회귀 탐지 | 읽기 전용(`-s read-only`). 결과는 `docs/dev-v1/logs/` |
| 기록 | 오케스트레이터 | 기술 검증·결정, 위키, 읽기 전용 에이전트의 결과 기록 | `docs/dev-v1/report.md`, `docs/wiki/`, `docs/dev-v1/logs/` |

- Gate 2에서 구현 단위는 촬영·리포트(`apps/web/src/self`, v4 02–04), 추구미·기록(`apps/web/src/muse`, v4 05–06), 검색·공용 계약(`pocs/core`, `pocs/search-celeb`)으로 나눴다. 독립 검증은 통합 구현과 분리해 운영 코드와 실제 Chrome 화면을 확인했다. Claude CLI 제약과 대체 실행은 [기술 보고](report.md#gate-2-통합)에 있다.
- `pocs/ui`(`@celeber/ui`)는 모든 PoC 앱이 공유하므로 꼭 필요한 버그 수정만 한다.
- Codex는 `.claude/skills`를 읽지 않으므로 프롬프트에 체크리스트를 직접 붙인다. 실행 명령은 [gate0-probe](logs/gate0-probe.md)에 있다.

## 마지막 검증 (2026-11-26, Gate 2 통합)

- Chrome 390×844 및 1440×900에서 통합 프로덕션 전체 흐름 24/24 PASS, 콘솔 오류 0건. 별도 v4 목업은 96/96 PASS. [통합 실행 로그](logs/gate2-browser/flow.log), [기술 검증](report.md#gate-2-통합)
- `pnpm typecheck`·`pnpm lint`·`pnpm test` 성공. 테스트 602개 통과, 실제 키를 쓰는 단위 테스트 17개 건너뜀. 통합 웹과 PoC 8개 프로덕션 빌드 성공.
- Git 대상 및 통합 앱 `.next`에서 로컬 키 값 일치 0건. 접속 코드 세션과 사진 보호, 삭제, 저장소를 유지한 재시작 확인.

## 다음 작업

1. 통합 화면을 [확인 시퀀스](../wiki/integration-flow.md#사람이-확인할-항목)로 HIL 판정한다.
2. 비용 승인을 받으면 Render에 개인용 앱을 배포한다. 배포 URL에서 HTTPS 카메라 권한, 저장·재시작, 핵심 흐름을 다시 확인한다.
