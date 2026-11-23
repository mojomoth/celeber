# hub — CELEBER PoC 허브 (포트 3100)

- `/`: 랜딩(logo-on-dark + color-halo-background + 시작하기) → 실행 모드(AI·이미지 검색·역이미지 검색·공유 DB), 선행관계 그래프, PoC 6종 카드(실행 여부·응답 시간·앱별 Mock 사유·주요 화면 링크), 디자인 토큰 미리보기.
- `/api/status`: 6개 앱 `/api/health`를 1.5초 타임아웃으로 확인한 결과 + 공유 DB 건수. `scripts/smoke.mjs`도 이 응답으로 "모든 앱이 같은 DB 파일을 쓰는지" 확인한다.
- `/api/health`: 허브 자체 DB·capabilities.

PoC 목록(포트·선행관계·주요 화면·확인용 API)은 `src/pocs.ts` 한 곳에 있다. `test/pocs.test.ts`가 각 앱 package.json의 포트·의존성, app/ 페이지 존재를 검사한다.

```bash
pnpm dev:hub          # 또는 루트에서 pnpm dev:all
```

각 앱 링크는 요청 Host 헤더의 호스트 이름 + 앱 포트로 만든다(LAN 주소로 열어도 동작). 앱 상태 확인 호스트는 `CELEBER_HUB_PROBE_HOST`(기본 127.0.0.1).
