# Gate 0: CLI·모델·API 접근 확인

- 일시: 2026-11-24
- 방법: 실제 호출. 키는 `set -a; source .env; set +a`로 셸 변수에만 올리고 상태코드·모델명만 기록했다.
- 비전 테스트 입력: 32×32 빨간 PNG 한 장. 정답은 "Red".

## CLI

| 대상 | 명령 | 결과 |
|---|---|---|
| Codex CLI | `codex --version` | `codex-cli 0.171.0` |
| Codex 기본 모델 | `timeout 300 codex exec --skip-git-repo-check -s read-only "Reply with the single word OK and your model name"` | PASS. 설정 기본값 `gpt-6.2-astra`(reasoning high) |
| Codex sol | `codex exec --skip-git-repo-check -s read-only -m gpt-6.2-sol "..."` | PASS |
| Codex 그 외 | `-m gpt-6.2`, `gpt-6.2-codex`, `gpt-6.2-astra-mini` | FAIL. ChatGPT 계정 로그인이라 지원하지 않는 모델 |
| Codex 이미지 생성 | `codex exec -s workspace-write "내장 이미지 생성 도구로 … probe.png 저장"` | PASS. 도구 `image_gen.imagegen`, 원본은 `~/.codex/generated_images/<세션>/`에 생기고 작업 폴더로 복사됨 |
| Claude CLI sonnet | `timeout 300 claude -p "Reply OK" --model claude-sonnet-5-5` | PASS (`claude-sonnet-5-5`) |
| Claude CLI opus | `timeout 300 claude -p "Reply OK" --model claude-opus-5-5` | PASS (`claude-opus-5-5`) |
| Claude CLI 이미지 분석 | `claude -p "Read the image file <절대경로> …" --model claude-sonnet-5-5 --allowedTools Read` | PASS ("Red.") |

Claude CLI는 API 키가 아니라 로그인 구독으로 동작하므로 아래 CLAUDE_API_KEY 한도와 무관하다.

## API 키

| 키 | 확인한 호출 | 상태 | 판정 |
|---|---|---|---|
| CLAUDE_API_KEY | `POST api.anthropic.com/v1/messages` (`claude-haiku-5-5`, max_tokens 8) | 400 사용 한도 초과, 2026-12-01 00:00 UTC 복구 | BLOCKED (12/1까지) |
| | `GET /v1/models` | 200. opus-5-5, sonnet-5-5, haiku-5-5, fable-5-2 등 | 키 자체는 유효 |
| OPENAI_API_KEY | `GET /v1/models` | 200 | PASS |
| | `POST /v1/responses` 비전: `gpt-6.2-astra`, `gpt-6.2-sol`, `gpt-5.5` | 200, 모두 "Red" (4.4초 / 1.8초 / -) | PASS |
| | `POST /v1/images/generations` `gpt-image-2`, quality low, 1024² | 200, b64 PNG 수신 (7.9초) | PASS |
| GOOGLE_API_KEY | `GET generativelanguage …/v1beta/models` | 200 | PASS |
| | `gemini-3.5-flash:generateContent` 비전 | 200 "Red", 응답 모델 `gemini-3.6-flash`, 94초 | 느림 |
| | `gemini-3.8-flash` / `gemini-flash-latest` | 503 수요 과다 | 불안정 |
| | `gemini-3.1-pro-preview` | 429 할당량 초과 | 사용 불가 |
| | `gemini-2.5-flash` | 404 신규 사용자 불가 | 사용 불가 |
| | Custom Search (`customsearch/v1`, 임시 cx) | 401 "API 키 미지원, OAuth 필요" | 사용 불가 |
| | Knowledge Graph Search | 400 키 무효 | 사용 불가 |
| JEV_KEY | `POST api.typesafe.ai/v1/systemone` (`jev-latest`, choice 질문) | 200, 응답 모델 `jev-1.14.0` | PASS. 아래 참고 |
| VERCEL_API_KEY | `GET api.vercel.com/v2/user` | 200 | PASS |
| RENDER_API_KEY | `GET api.render.com/v1/owners` | 200, team 1개 | PASS |

### JEV_KEY

`apikey_` 접두어 형식이다. 이 프로젝트 문서에는 용도 설명이 없고, 같은 PC의 다른 작업(`~/work/study/aside-jev-work`)에서 Typesafe Jev API(`https://api.typesafe.ai/v1/systemone`, Bearer 인증)로 쓰인 것을 확인했다. 텍스트 상태(`state`)와 선택지(`criteria`)를 주면 선택·확률·신뢰도를 돌려주는 분류 API다. 이미지 입력은 확인하지 않았다.

### 사용 가능 모델 목록 (요약)

- OpenAI 이미지: `gpt-image-2`, `gpt-image-2.5-flare`, `gpt-image-2.5-sunburst`, `gpt-image-2.6-flare`, `gpt-image-2.6-sunburst`, `gpt-image-1.5`, `gpt-image-1-mini`, `chatgpt-image-latest`
- OpenAI 텍스트·비전: `gpt-6.2-astra`, `gpt-6.2-sol`, `gpt-6.1-sol`, `gpt-6-astra`, `gpt-5.5`, `gpt-5.4-mini` 등
- Gemini 이미지: `gemini-3.1-flash-image`, `gemini-3-pro-image`, `gemini-nano-banana-2.1` (호출 미확인)

## 결론

- 비전 분석: OpenAI `gpt-6.2-sol`(빠름) 또는 `gpt-6.2-astra`를 1순위로 쓴다. Gemini는 지연·503이 잦아 예비로만 둔다. Anthropic API는 12/1까지 막혀 있다.
- 개발용 분석·검증 에이전트: Claude CLI(sonnet-5-5, opus-5-5) 정상.
- 이미지 생성: Codex CLI 내장 도구와 OpenAI `gpt-image-2` 둘 다 정상.
- 연예인 사진 검색: Google Custom Search는 이 키로 불가. 다른 경로가 필요하다.
