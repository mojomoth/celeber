# 위키 변경 기록

덧붙이기만 한다. 형식은 `## [YYYY-MM-DD] 종류 | 제목`이다.

## [2026-11-24] ingest | 개발 도구 6종
[tools.md](tools.md) 작성. skill은 프로젝트 `.claude/skills/`에만 설치했다.

## [2026-11-24] verify | Gate 0 CLI·API 실측
실측 로그 추가. [gate0-probe](../dev-v1/logs/gate0-probe.md)

## [2026-11-24] verify | Gate 0 dev 서버
실행 로그 추가. [gate0-devserver](../dev-v1/logs/gate0-devserver.md)

## [2026-11-24] create | 최소 API 계약과 하네스
[api-contract.md](api-contract.md), [run.md](../dev-v1/run.md), [index.md](index.md) 작성.

## [2026-11-24] fix | Gate 0 검증 지적 반영
[report.md](../dev-v1/report.md) 추가, 중복된 상태 문구를 [run.md](../dev-v1/run.md)로 모음.

## [2026-11-24] fix | Gate 0 재검증 지적 반영
바로 위 기록과 달리 report.md가 실제로는 만들어지지 않았다. 이번에 [report.md](../dev-v1/report.md)를 작성했고, 로그 제목의 엠대시를 콜론으로 바꿨다.

## [2026-11-24] verify | Gate 1 AI 대체 공급자
OpenAI 대체 공급자 연결과 실제 호출 기록. [gate1-ai](../dev-v1/logs/gate1-ai.md). api-contract의 `Capabilities`에 `aiProvider` 추가.

## [2026-11-24] verify | Gate 1 PoC 검증과 마감 확인
PoC 6개 입출력 검증·critic, core 공용 수정과 재검증 결과를 [run.md](../dev-v1/run.md#gate-1-미통과)와 [report.md](../dev-v1/report.md)에 반영. 빌드·테스트·키 노출 검사는 [gate1-close](../dev-v1/logs/gate1-close.md).

## [2026-11-24] fix | Gate 0 검증 minor 4건
[api-contract.md](api-contract.md)의 `aiSource` 범위와 업로드 오류 코드, [tools.md](tools.md)의 log 종류, run.md의 제공 파일 근거를 고쳤다. Anthropic 차단 기록은 report.md 미해결 한 곳으로 모았다.

## [2026-11-24] change | git 초기화
로컬 `main`에 커밋 2개. 원격이 없어 푸시는 하지 않았다. 커밋에서 뺀 범위는 [report.md 결정](../dev-v1/report.md#결정).

## [2026-11-24] verify | Gate 1 잔여 이슈 재검증과 마감
camera-body major, core 회귀·data URL, AI 공급자 체인 리뷰, PoC별 minor를 고치고 재검증해 모두 PASS(minor만 남음). Gate 1은 자동 검증 PASS, HIL 대기, UI 목업 HOLD. 상태는 [run.md](../dev-v1/run.md), 마감 검사는 [gate1b/close](../dev-v1/logs/gate1b/close.md).

## [2026-11-24] change | git 원격 연결
- origin `https://github.com/mojomoth/celeber.git`(공개) 연결, `main` 푸시. 푸시 BLOCKED 해제. [run.md](../dev-v1/run.md)

## [2026-11-24] verify | Gate 1 PASS: HIL과 UI 목업
사용자 직접 지시로 HIL PASS. v4 시안 UI 목업(`pocs/ui/mockup`) 6화면 일치도 93–97, 전체 흐름 96/96, Codex 2차 리뷰 반영. [gate1-ui](../dev-v1/logs/gate1-ui.md), [ui-mockup-codex](../dev-v1/logs/critic/ui-mockup-codex.txt). 상태는 [run.md](../dev-v1/run.md), 결정(HIL 근거, 목업 위치·구조, 이미지 검색 대체, 공개 범위)은 [report.md](../dev-v1/report.md#결정)

## [2026-11-26] change | Gate 2 웹 앱 통합

`apps/web`에서 v4 화면, 여섯 PoC의 기능, OpenAI 이미지 검색을 연결했다. 시퀀스와 함수 입출력은 [통합 앱 흐름](integration-flow.md), 기술 결과는 [보고](../dev-v1/report.md#gate-2-통합)에 기록했다.
