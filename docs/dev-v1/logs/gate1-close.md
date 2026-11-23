# Gate 1 마감 확인 (2026-11-24)

UI 목업은 범위에서 뺐다. 원문 출력은 [gate1-close/](gate1-close/)에 있다.

## 빌드·테스트

| 명령 | 결과 |
|---|---|
| `pnpm typecheck` | exit 0 ([typecheck.log](gate1-close/typecheck.log)) |
| `pnpm lint` | exit 0, 경고 0 ([lint.log](gate1-close/lint.log)) |
| `pnpm test` | exit 0. 518개 통과, 17개 건너뜀(실제 키가 필요한 live 테스트). core 117, hub 5, camera-body 89, search-celeb 52, celeb-vibe 89, camera-face 50, personal-color-report 51, celeb-vibe-report 65 ([test.log](gate1-close/test.log)) |
| `pnpm build:all` | exit 0. 7개 앱 모두 `next build` 성공, 19초 ([build.log](gate1-close/build.log)) |

## 키 노출 검사

`.env`를 bash 셸 변수로만 불러 6개 키(JEV, GOOGLE, OPENAI, CLAUDE, VERCEL, RENDER)를 `grep -rlF`로 찾았다. 값 전체, 앞 12자, 뒤 10자 세 가지로 찾았고 일치한 파일 수만 셌다. 키 값은 출력하지 않았다.

| 대상 | 일치 파일 |
|---|---|
| 저장소 전체(`node_modules`, `.next`, `.env` 제외. docs·로그·`pocs/.data` 포함) | 0 |
| 클라이언트 번들 `pocs/*/.next/static` (7개 앱) | 0 |
| 서버 번들 `pocs/*/.next/server` | 0 |
| `docs/` | 0 |
| `pocs/.data` (SQLite·업로드) | 0 |
| 작업 scratchpad | 0 |

- `NEXT_PUBLIC_`: 코드와 `.env`에서 쓰지 않는다. `.env.example`과 README에 "붙이지 말 것"이라는 안내만 있다. 클라이언트 번들에서도 0건이다.
- 커밋 직전 스테이징 내용 전체를 같은 방식으로 다시 검사했다. 결과는 [run.md](../run.md#마지막-검증-2026-11-24)에 있다.
