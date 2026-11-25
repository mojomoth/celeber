# 위키 목록

개발 중에 쓰거나 바꾼 문서의 목록과 출처다. 원본 문서는 읽기만 하고, 내용을 옮겨 적지 않고 링크한다. 변경 이력은 [log.md](log.md)에 있다.

## 진행과 결정

- [dev-v1/run.md](../dev-v1/run.md): 현재 단계, 게이트 조건, TODO, 역할·파일 소유권, PASS/FAIL/BLOCKED
- [dev-v1/report.md](../dev-v1/report.md): 기술 검증 결과, 중요한 결정, 미해결 문제
- [dev-v1/logs/](../dev-v1/logs/): 실행 로그 원문. Gate 0 [probe](../dev-v1/logs/gate0-probe.md), [dev 서버](../dev-v1/logs/gate0-devserver.md). Gate 1 [AI 공급자](../dev-v1/logs/gate1-ai.md), [core 수정](../dev-v1/logs/gate1-core-fix.md), [마감 확인](../dev-v1/logs/gate1-close.md), [UI 목업](../dev-v1/logs/gate1-ui.md)([Codex 리뷰](../dev-v1/logs/critic/ui-mockup-codex.txt)). PoC별 로그는 run.md의 PoC별 결과 표에서 링크한다. 스크린샷은 커밋하지 않는다

## 개발 문서

- [api-contract.md](api-contract.md): PoC Route Handler 요청·응답 계약. 출처는 `pocs/core/src/contracts`와 각 PoC의 `src/lib`, `src/routes`
- [통합 앱 흐름](integration-flow.md): 촬영부터 기록까지의 순서, 함수 입출력과 HIL 확인 항목
- `pocs/ui/mockup`: v4 시안 UI 목업 앱(포트 3107). 화면은 `src/screens/`, 목업 데이터는 `src/data/mock.ts`. 출처는 `docs/ui/drafts/v4`
- [tools.md](tools.md): 개발 도구 6종의 설치 위치와 적용 체크리스트. 출처는 각 도구의 원본 저장소와 gist

## 원본 (읽기 전용)

- [prompts/PROMPT_V0.md](../prompts/PROMPT_V0.md): 개발 지시와 게이트 정의
- [POC.md](../POC.md): PoC 범위와 기대 입출력
- [POC-RESULT.md](../POC-RESULT.md): PoC 결과 보고
- [CONTEXT.md](../CONTEXT.md): 앱 화면 요구사항
- [README.md](../../README.md): 저장소 구조와 실행 명령
- `docs/ui/`: 디자인 시안과 참고 이미지
- `assets/`: BI, 목업 프레임
