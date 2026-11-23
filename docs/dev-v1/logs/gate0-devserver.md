# Gate 0: 개발 서버·기존 상태 확인 (2026-11-24)

코드는 고치지 않았다. 서버는 공유 데이터(`pocs/.data`)를 건드리지 않도록 그 사본을 `CELEBER_DATA_DIR`로 지정해 띄웠다.

## 환경

- Node v26.0.0, pnpm 11.6.0, Next.js 16.4.6
- git 저장소 아님(`fatal: not a git repository`)
- `.env`에 있는 키 이름: `JEV_KEY`, `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `CLAUDE_API_KEY`, `VERCEL_API_KEY`, `RENDER_API_KEY`
  - 코드가 읽는 키는 `CLAUDE_API_KEY` 하나다(`ANTHROPIC_API_KEY`의 별칭). OpenAI·Google 키는 코드에서 쓰지 않는다.
  - `NAVER_*`, `SERPAPI_API_KEY`가 없어서 이미지 검색과 역이미지 검색은 항상 Mock이다.

## 정적 검증

| 명령 | 결과 |
| --- | --- |
| `pnpm typecheck` | exit 0, 9개 패키지 |
| `pnpm lint` | exit 0, 9개 패키지 오류·경고 0 |
| `pnpm test` | exit 0, 344개 통과 (core 92, hub 5, camera-face 39, camera-body 37, search-celeb 35, celeb-vibe 60, personal-color-report 32, celeb-vibe-report 44) |

## 개발 서버 (`pnpm dev:all`)

| 포트 | 앱 | 개별 실행 | `/api/health` | `/` |
| --- | --- | --- | --- | --- |
| 3100 | hub | `pnpm dev:hub` | 200 | 200 |
| 3101 | camera-face | `pnpm dev:camera-face` | 200 | 200 |
| 3102 | camera-body | `pnpm dev:camera-body` | 200 | 200 |
| 3103 | search-celeb | `pnpm dev:search-celeb` | 200 | 200 |
| 3104 | celeb-vibe | `pnpm dev:celeb-vibe` | 200 | 200 |
| 3105 | personal-color-report | `pnpm dev:personal-color-report` | 200 | 200 |
| 3106 | celeb-vibe-report | `pnpm dev:celeb-vibe-report` | 200 | 200 |

두 모드 모두 7개 앱이 4초 안에 포트를 열었고, 첫 페이지 컴파일은 0.6~1.5초 걸렸다. health의 `db`는 7개 앱 모두 같은 경로를 쓰고 `ok:true`, `roundTrip:true`, schemaVersion 1이다.

### health `capabilities`

| 항목 | 실제 모드(키 있음) | `CELEBER_FORCE_MOCK=1` |
| --- | --- | --- |
| `ai` (Claude) | **true** (live 판정) | false |
| `model` | `claude-opus-5-5` | null |
| `imageSearch` | mock (네이버·SerpAPI 키 없음) | mock |
| `reverseImageSearch` / `…Uploads` | false / false | false / false |
| `forceMock` | false | true |
| `aiBlockedReason` | null | null |

7개 앱 모두 같은 값이었다. 허브 `/api/status`에서도 `allRunning:true`로 같은 값이 나왔다.

주의: 실제 모드의 `ai:true`는 키가 있고 아직 차단되지 않았다는 뜻일 뿐이다. 실제 Claude 호출이 성공한다는 증거는 아니다. POC-RESULT에는 이 키가 2026-12-01까지 사용 한도 초과(400)라고 적혀 있다. 첫 호출이 한도 오류로 실패하면 그 앱 프로세스는 10분간 `aiBlockedReason`을 채우고 Mock으로 돈다. 실제 호출 확인은 Gate 1에서 한다.

## 스모크

| 모드 | 명령 | 결과 |
| --- | --- | --- |
| 실제 | `node scripts/smoke.mjs --no-e2e` | 34/34 통과(홈·페이지·GET API). E2E는 유료 AI 호출을 하므로 Gate 0에서는 돌리지 않았다 |
| Mock | `pnpm smoke` | 57/57 통과, 7.7초. 만든 기록은 스크립트가 삭제 |

POC-RESULT 마무리 검증에는 58/58로 적혀 있지만 이번 실행의 항목 수는 57이다. 모두 통과했으므로 실패는 아니다. 원인(코드·DB 확인): `scripts/smoke.mjs`는 테스트 인물 '윤하람'이 DB에 이미 있으면 정리 단계의 인물 DELETE를 세지 않는다. 이번에 쓴 공유 DB 사본에는 이 인물이 있다(`celebs` 1건).

## 종료

`pnpm dev:all` 프로세스 트리를 TERM으로 종료했다. 두 번 모두 3100~3106 LISTEN 0, `next dev` 프로세스 0개.

## .gitignore (수정하지 않음)

있음: `node_modules/`, `.next/`, `out/`, `dist/`, `coverage/`, `*.tsbuildinfo`, `next-env.d.ts`, `pocs/.data/`, `.env`, `.env.*`(`!.env.example`), `pocs/*/public/mediapipe/`, `pocs/*/public/bi/`, `.DS_Store`, `*.log`. `.env.example`의 키 값은 모두 비어 있다.

누락이거나 결정이 필요한 것:

- `.claude/settings.local.json`: 지금은 없지만 `.claude/`가 있으므로 미리 제외해 두는 편이 안전하다.
- `.vercel/`, `.turbo/`: 배포 도구를 쓰면 생긴다(`VERCEL_API_KEY`, `RENDER_API_KEY`가 `.env`에 있다).
- `pocs/ui/static/mediapipe/` (86MB): `pnpm fetch:models`로 받을 수 있다. 커밋에서 뺄지, LFS로 올릴지 정해야 한다.
- `pocs/core/fixtures/demo-people/`: 참고 시안에서 잘라 낸 데모 모델 사진이다. POC-RESULT §11에 배포물에 넣지 않는다고 되어 있으니, 커밋 범위를 정해야 한다.
