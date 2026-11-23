# 실행 상태 (run)

개발 진행을 통제하는 단일 문서다. 기술 검증 결과와 결정 근거는 [report.md](report.md), 문서 목록은 [wiki/index.md](../wiki/index.md)에 있다.

- 갱신: 2026-11-24
- 현재 단계: **Gate 1 자동 검증 PASS — HIL 대기, UI 목업 HOLD**. 모든 PoC와 core·AI 공급자 체인이 재검증 PASS(minor만 남음)다. 게이트 통과는 사용자 HIL 판정을 기다린다.
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

## Gate 1: 자동 검증 PASS — HIL 대기, UI 목업 HOLD

판정 규칙: 모든 PoC와 core·AI 공급자 체인이 PASS(minor만 남음)이면 자동 검증 PASS다. HIL과 UI 목업은 사용자 결정 전까지 게이트 PASS로 올리지 않는다.

### 공통 항목

| 항목 | 상태 | 근거·비고 |
|---|---|---|
| 실제 API 호출 | PASS | Anthropic → OpenAI(`gpt-6.2-sol`) → Mock. 각 PoC에서 `source: 'ai'`·`hybrid` 확인. [gate1-ai](logs/gate1-ai.md) |
| AI 공급자 체인(`ai.ts`·`env.ts`) | PASS | Codex sol 포함 독립 재검증 r2, major 0·minor 8. [ai-chain-review-r2](logs/gate1b/ai-chain-review-r2.md) |
| core 공용 수정 | PASS | 회귀·data URL 오류 수정 후 재검증 r2, major 0·minor 5. [core-dataurl-r2-verify](logs/gate1b/core-dataurl-r2-verify.md) |
| 이미지 검색 실제 공급자 | BLOCKED | 키 없음. 제한으로 기록. [사용자 결정 필요](#사용자-결정-필요) |
| `/pocs/<앱>` 경로 | PASS | 6개 PoC 모두 307로 앱 경로에 연결. 각 PoC 로그 참고 |
| 빌드·테스트·키 노출 | PASS | [gate1b/close](logs/gate1b/close.md) |
| UI 목업 (`pocs/ui`, v4 시안) | HOLD | 아래 참고 |
| HIL 검증 | HIL 대기 | 사용자 판정 전까지 PASS로 올리지 않는다 |
| 커밋 | PASS | 로컬 `main`에 커밋 3개 |
| 푸시 | BLOCKED | 원격 없음 |

### PoC별 결과

입출력 검증은 구현 측, 재검증은 새 컨텍스트의 독립 검증자(Claude + Codex sol 2차 의견)가 맡았다. minor 원문은 재검증 로그에 있다.

| PoC | 입출력 검증 | 재검증 | 판정 | 남은 이슈 (모두 minor) | 로그 |
|---|---|---|---|---|---|
| camera-face | PASS | PASS | PASS | 3: 조작된 랜드마크 미검증, 서버 yaw 범위가 브라우저 값을 깎음, core ROI 상한으로 낮아진 신뢰도 | [재검증](logs/gate1b/camera-face-recheck-r1.md) |
| camera-body | PASS | PASS | PASS | 4: ±10° 기울기 판정 비대칭, 요약 칩 반올림 차이, 무릎 하나 가려진 앉은 사진, 딱 맞는 모자 경고 없음 | [재검증](logs/gate1b/cb-recheck-r2/README.md) |
| search-celeb | PASS | PASS | PASS | 4: 설명 없는 행이 후보를 흡수, 동명이인 검색어 2·3번째 동일, `cleanRole` 오인식, 데모 안내 중복 | [재검증](logs/gate1b/search-celeb-recheck-r1.md) |
| celeb-vibe | PASS | PASS | PASS | 2: 언더톤 보류인데 톤 이름에 '웜', 앱 전체 404 문구가 기록 전용 | [재검증](logs/gate1b/cv-recheck-r1/README.md) |
| personal-color-report | PASS | PASS | PASS | 5: ⑭ ROI 누락 안내 잘림·문장 모순, 업로드 중단·text/plain 문구, 마침표 중복 | [재검증](logs/gate1b/pcr-minor-recheck-r1.md) |
| celeb-vibe-report | PASS | PASS | PASS | 9: 색 측정 불가 근거 문장, 예전 가이드, 색 단어 필터 누락·오인식, 중복 주의 문구, 레이더 라벨 잘림(`pocs/ui`, HOLD), dev HMR 미재현 | [재검증](logs/gate1b/cvr-recheck-r1/README.md) |

**UI 목업(pocs/ui, v4 시안): HOLD.** 사용자 확인을 기다린다. 다른 세션에서 "HIL 생략, UI는 docs/ui/drafts/v4 기준" 지시가 전달되었지만 사용자에게 직접 확인하지 않았다. 진행하게 되면 `@celeber/ui` 패키지(디자인 토큰·공용 컴포넌트)를 깨지 않도록 별도 경로나 별도 앱으로 둔다.

**HIL 처리:** HIL이 필요한 항목은 "HIL 대기"로 표시하고, 사용자 판정이 나오기 전에는 PASS로 바꾸지 않는다. HIL 대기 항목이 있어도 그와 무관한 작업은 계속한다.

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
- [ ] (HIL 대기) 사용자 HIL 판정
- [ ] (HOLD) UI 목업
- [ ] 남은 minor 정리(위 표, Gate 2 통합 전에 우선순위 결정)

## 사용자 결정 필요

1. **HIL 판정.** PoC 6개를 실제로 써 보고 통과 여부를 정한다.
2. **UI 목업 v4 진행 여부.** 진행하면 `@celeber/ui`와 분리된 경로에 둔다.
3. **원격 저장소.** 연결할 저장소와 공개 범위(커밋에서 뺀 파일 포함)를 정한다.
4. **이미지 검색 대체.** 키가 없는 동안 OpenAI `web_search`를 연예인 사진 검색에 쓸지 정한다.

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

- `pnpm typecheck`·`pnpm lint` exit 0, `pnpm test` 594개 통과(17개 건너뜀), `pnpm build:all` 7개 앱 성공. [gate1b/close](logs/gate1b/close.md)
- 키 노출: 저장소, 각 앱 `.next`, docs, 로그, `pocs/.data`에서 `.env` 값 6개 일치 0건. 코드의 `NEXT_PUBLIC_` 사용 0건
- 커밋 전 스테이징 검사: `.env`는 추적·스테이징되지 않았고, 스테이징된 파일 전체에서 `.env` 값 일치 0건
- dev 서버는 띄우지 않았다. 3100~3106 LISTEN 0건
- git: 로컬 `main`에 커밋 3개. 푸시: BLOCKED(원격 없음)

## 다음 작업

1. 사용자에게 [사용자 결정 필요](#사용자-결정-필요) 4건을 묻는다.
2. HIL을 통과하면 Gate 1을 PASS로 올리고 Gate 2(통합)를 시작한다.
3. HIL 판정을 기다리는 동안 남은 minor 가운데 통합에 영향이 큰 것(camera-face 서버 검증, ai.ts 동시 요청 차단, env.ts 경고 로그 원문)부터 고친다.
