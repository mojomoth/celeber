# 실행 상태 (run)

개발 진행을 통제하는 단일 문서다. 기술 검증 결과와 결정 근거는 [report.md](report.md), 문서 목록은 [wiki/index.md](../wiki/index.md)에 있다.

- 갱신: 2026-11-24
- 현재 단계: **Gate 1 마감 확인 끝, 게이트는 미통과**. camera-body 재검증과 core 회귀 1건이 남았고, HIL은 사용자 판정 대기, UI 목업은 HOLD다.
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

## Gate 1: 미통과

### 공통 항목

| 항목 | 상태 | 근거·비고 |
|---|---|---|
| 실제 API 호출 | PASS | Anthropic → OpenAI(`gpt-6.2-sol`) → Mock. 각 PoC에서 `source: 'ai'`·`hybrid` 확인. [gate1-ai](logs/gate1-ai.md) |
| 이미지 검색 실제 공급자 | BLOCKED | 키 없음. 제한으로 기록. [report.md 미해결](report.md#미해결) |
| `/pocs/<앱>` 경로 | PASS | 6개 PoC 모두 307로 앱 경로에 연결. 각 PoC 로그 참고 |
| core 공용 수정 | FAIL | 대상 5건은 해결. 재검증에서 회귀 1건(minor). [gate1-core-fix](logs/gate1-core-fix.md), [재검증](logs/core-recheck/run-log.txt) |
| 빌드·테스트·키 노출 | PASS | [gate1-close](logs/gate1-close.md) |
| UI 목업 (`pocs/ui`, v4 시안) | HOLD | 아래 참고 |
| HIL 검증 | HIL 대기 | 사용자 판정 전까지 PASS로 올리지 않는다 |
| 커밋 | PASS | 로컬 `main`에 커밋 2개 |
| 푸시 | BLOCKED | 원격 없음 |

### PoC별 결과

입출력 검증은 구현 측, critic은 새 컨텍스트의 독립 검증자(Claude sonnet + Codex sol 2차 의견)가 맡았다. minor 이슈 원문은 critic 로그에 있다.

| PoC | 입출력 검증 | critic | 판정 | 남은 이슈 | 로그 |
|---|---|---|---|---|---|
| camera-face | PASS | PASS | PASS | minor 2 (앱). core 2건은 core 수정으로 해결 | [검증](logs/gate1-camera-face.md), [critic](logs/critic/camera-face-r2.md) |
| camera-body | PASS | FAIL | FAIL | major 1(선바이저 사진의 정수리), minor 5. 라운드 3 수정은 끝났고 재검증 전이다 | [검증](logs/gate1-camera-body.md), [critic](logs/critic/cb-r3/README.md), [수정](logs/cb-fix-r3/README.md) |
| search-celeb | PASS | PASS | PASS | minor 5 (앱). core 1건 해결 | [검증](logs/gate1-search-celeb.md), [critic](logs/critic/gate1-search-celeb-r2.md) |
| celeb-vibe | PASS | PASS | PASS | minor 4 (앱). core 1건 해결 | [검증](logs/gate1-celeb-vibe.md), [critic](logs/critic/celeb-vibe-r3.md) |
| personal-color-report | PASS | PASS | PASS | minor 4 (앱), core 회귀 1건이 이 앱에서 드러남. core 2건 해결 | [검증](logs/gate1-personal-color-report.md), [critic](logs/critic/pcr-r2/) |
| celeb-vibe-report | PASS | PASS | PASS | minor 6 (앱 5, celeb-vibe 측정 1). dev HMR 새로고침 반복 포함 | [검증](logs/gate1-celeb-vibe-report.md), [critic](logs/critic/cvr-r2/) |

**UI 목업(pocs/ui, v4 시안): HOLD.** 사용자 확인을 기다린다. 다른 세션에서 "HIL 생략, UI는 docs/ui/drafts/v4 기준" 지시가 전달되었지만 사용자에게 직접 확인하지 않았다. 진행하게 되면 `@celeber/ui` 패키지(디자인 토큰·공용 컴포넌트)를 깨지 않도록 별도 경로나 별도 앱으로 둔다.

**HIL 처리:** HIL이 필요한 항목은 "HIL 대기"로 표시하고, 사용자 판정이 나오기 전에는 PASS로 바꾸지 않는다. HIL 대기 항목이 있어도 그와 무관한 작업은 계속한다.

## TODO

Gate 1
- [x] OpenAI 대체 공급자 추가, 실제 호출 ([gate1-ai](logs/gate1-ai.md))
- [x] PoC 6개 입출력 검증과 독립 critic(병렬)
- [x] `/pocs/...` 경로 접근
- [x] core 공용 이슈 5건 수정 ([gate1-core-fix](logs/gate1-core-fix.md))
- [x] 실패·제한 기록, 빌드·테스트·키 노출 검사, git 초기화와 커밋
- [ ] camera-body 라운드 3 수정분 재검증 (major 선바이저)
- [ ] personal-color-report `assemble.ts:208` 정규식이 새 ROI 누락 문구를 인식하게 수정 (core 회귀)
- [ ] core: data URL `%ZZ` 500 → 400
- [ ] AI 공급자 변경분(`ai.ts`, `env.ts`) Codex sol 독립 리뷰
- [ ] PoC별 minor 이슈 정리 (critic 로그 기준)
- [ ] (결정 필요) 이미지 검색 대체로 OpenAI `web_search`를 쓸지
- [ ] (결정 필요) 원격 저장소 연결과 푸시
- [ ] (HOLD) UI 목업
- [ ] (HIL 대기) 사용자 HIL 판정

## 역할과 파일 소유권

구현자와 검증자는 같은 작업 단위에서 겹치지 않는다. 검증자는 새 컨텍스트에서 시작하고 실제 화면과 실제 응답을 본다.

| 역할 | 에이전트·모델 | 담당 | 쓰기 권한 |
|---|---|---|---|
| 오케스트레이터 | 메인 세션 (Claude opus-5-5) | 계획, 작업 배분, 게이트 판정, 커밋 | `docs/dev-v1/run.md`, `.gitignore` |
| 구현자 | Claude CLI `claude-opus-5-5` | 서버·인터페이스 구현, 비주얼 정리 | 배정받은 `pocs/<앱>/` 하나. `pocs/core`는 한 번에 한 에이전트만 |
| 분석·외형 검증자 | Claude CLI `claude-sonnet-5-5` | 이미지 분석, 원본 디자인과 실제 화면 비교, 응답 검증 | 읽기 전용. 결과는 `docs/dev-v1/logs/` |
| 이미지 생성·수정 | Codex CLI `gpt-6.2-astra` (`image_gen` 도구) | 배경·에셋 생성과 수정 | `assets/` 아래 새 파일. `assets/bi`, `assets/mockup` 원본은 읽기 전용 |
| 2차 독립 리뷰 | Codex CLI `gpt-6.2-sol` (깊은 검토는 `gpt-6.2-astra`) | 코드 리뷰, 계약 위반·회귀 탐지 | 읽기 전용(`-s read-only`). 결과는 `docs/dev-v1/logs/` |
| 기록 | 오케스트레이터 | 기술 검증·결정, 위키, 읽기 전용 에이전트의 결과 기록 | `docs/dev-v1/report.md`, `docs/wiki/`, `docs/dev-v1/logs/` |

- `pocs/ui`(`@celeber/ui`)는 모든 PoC 앱이 공유하므로 꼭 필요한 버그 수정만 한다.
- Codex는 `.claude/skills`를 읽지 않으므로 프롬프트에 체크리스트를 직접 붙인다. 실행 명령은 [gate0-probe](logs/gate0-probe.md)에 있다.

## 마지막 검증 (2026-11-24)

- `pnpm typecheck`·`pnpm lint` exit 0, `pnpm test` 518개 통과(17개 건너뜀), `pnpm build:all` 7개 앱 성공. [gate1-close](logs/gate1-close.md)
- 키 노출: 저장소, `.next/static`·`.next/server`, docs, 로그, `pocs/.data`에서 `.env` 값 6개 일치 0건. `NEXT_PUBLIC_` 사용 0건
- 커밋 전 스테이징 검사: `.env`는 스테이징되지 않았고, 스테이징된 파일 전체에서 `.env` 값 일치 0건
- dev 서버는 띄우지 않았다. 3100~3106 LISTEN 0건
- git: 로컬 `main`에 커밋 2개(PoC 기준선, Gate 0·1). 푸시: BLOCKED(원격 없음)

## 다음 작업

1. camera-body 라운드 3 수정분을 새 critic으로 재검증한다.
2. personal-color-report 정규식 회귀와 core data URL 500을 고친 뒤 core 재검증을 다시 돌린다.
3. `ai.ts`·`env.ts`를 Codex sol로 독립 리뷰한다.
4. 사용자에게 HIL 판정, UI 목업 진행 여부, 원격 저장소, 이미지 검색 대체 여부를 묻는다.
5. 위 1~3이 PASS이고 HIL을 통과하면 Gate 1을 PASS로 올리고 Gate 2를 시작한다.
