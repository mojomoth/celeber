# Gate 1: celeb-vibe 실제 입출력 검증 (2026-11-24)

- 실행: `CELEBER_DATA_DIR=<scratchpad 사본> pnpm --filter @celeber/celeb-vibe dev` (포트 3104, `CELEBER_FORCE_MOCK` 없음). 공유 데이터 `pocs/.data`는 건드리지 않았다.
- 브라우저: Playwright 1.64.1(npx 캐시) headless Chromium, 430×932. MediaPipe는 SwiftShader WebGL로 동작했다.
- 키는 `.env`에서 셸 변수로만 읽었다. 아래에는 상태와 모델명만 적는다.

## 경로 접근

| 경로 | 결과 |
|---|---|
| `http://localhost:3104/`, `/analyses`, `/api/health`, `/api/meta` | 200 |
| `http://localhost:3104/pocs/celeb-vibe` | 404 (`/pocs/celeb-vibe/`는 308 후 404) |
| 허브 링크 | `pocs/hub/src/pocs.ts`의 `pocUrl`이 `http://<host>:3104/`, `/analyses`로 연결한다. 카드에 `:3104 · pocs/celeb-vibe`라고 표시한다 |

앱에는 basePath가 없다. `/pocs/...` URL을 게이트 조건으로 본다면 7개 앱에 같은 방식을 정해야 하므로 이 앱만 고치지 않았다(아래 미해결 1).

## 실제 호출

시작 시 health는 `aiProvider: anthropic`였다. 첫 분석에서 Anthropic이 400(사용 한도, 12/1 복구)으로 실패하자 OpenAI로 넘어갔고, 이후 `aiProvider: openai`, `model: gpt-6.2-sol`, `aiBlockedReason: null`이었다.

| 입력 | 경로 | source | isMock | 시간 | 판정 |
|---|---|---|---|---|---|
| `look-a.jpg` (베이지 스웨트셔츠, 차콜 와이드 슬랙스, 회색 토트백, 검정 구두) | UI 전체 흐름(브라우저 측정 → precheck → analyze) | hybrid | false | 측정 20초, 분석 19초 | 분석 가능, 전신, 1명 |
| `look-b.jpg` (Y-3 바이저, 크림 프린트 티셔츠·쇼츠, 흰 양말, 스니커즈, 얼굴 측면) | UI 전체 흐름 | hybrid | false | 측정 20초, 분석 22초 | 분석 가능, `occluded` info |
| `look-b-2.jpg` (b 좌우 반전) | API만(측정값 없음) | ai | false | 23초 | 분석 가능 |
| Mock 검색용 SVG 실루엣 | API만 | ai | false | 15초 | 분석 불가, AI가 `not-photo` 추가 |
| look-a 다시 분석(룩 이름 수정 후) | `POST /analyses/[id]/reanalyze` | hybrid | false | 18초 | 같은 id, 수정한 룩 이름 유지 |

- 결과 화면에 "데모 데이터" 배지 0건, 경고 박스 없음. 헤더에 `측정 + AI 분석 · gpt-6.2-sol`이 표시된다.
- zod: 서버가 `VibeAnalysisSchema.parse`로 조립하고, `GET /api/vibe/analyses/[id]`로 받은 JSON을 다시 `VibeAnalysisSchema.safeParse`로 확인했다(2/2 통과).

## 사진과 내용 대조

- look-a: 아이템 4개(드롭 숄더 크루넥 스웨트셔츠 `#D3CDC0` 라이트 베이지 · 오버핏, 와이드 플리츠 슬랙스 `#433F42` 차콜, 청키 솔 슈즈 블랙, 패브릭 토트백 웜 그레이). 핫스팟 번호가 각 아이템 위에 놓인다. 스타일은 미니멀·캐주얼·모던, 무드는 절제된·차분한·여유로운. 사진과 맞다.
- look-b: 아이템 5개(로고 바이저, 추상 프린트 반팔 티셔츠와 소매 줄무늬, 추상 프린트 쇼츠, 골지 크루 삭스, 러닝형 스니커즈). 포인트 색으로 프린트의 테라코타가 들어갔다. 스타일은 스포티·스트릿·캐주얼. 사진과 맞다.
- 실루엣 SVG: 상의·바지·신발 3개만 만들고 `사진 아님`(error)을 붙였다. 퍼스널컬러는 "사진 조건 때문에 참고용", 신뢰도 30%로 표시한다.
- 인물 신원 언급은 없다. 체형 비율은 7.35등신·8.18등신으로, 포즈 관절 기반 근사치라는 안내가 붙는다.

## 버그와 수정

**퍼스널컬러 교차 검증이 독립적이지 않았다.** `buildVibePrompt`가 측정 JSON에 규칙 톤(`ruleTone`)과 축(`ruleAxes`)을 넣어서, AI가 그 톤을 그대로 따라갔다. 그 결과 "측정과 AI 일치" 가점(+0.10)이 항상 붙었다.

| 사진 | 규칙 톤 | 규칙 톤을 넣었을 때 AI | 뺐을 때 AI |
|---|---|---|---|
| look-a | 봄웜 브라이트 | 봄웜 브라이트(2회), 신뢰도 0.85(상한) | 가을웜 딥 |
| look-b | 봄웜 라이트 | 봄웜 라이트, 0.79 | 가을웜 뮤트 / 판단 안 함 |

- 수정: `pocs/celeb-vibe/src/lib/build.ts`에서 `ruleTone`·`ruleAxes`를 프롬프트에서 뺐다. 피부·헤어·눈 hex와 Lab은 그대로 넘긴다. 최종 톤은 기존처럼 측정 분류를 쓴다.
- 테스트: `test/lib.test.ts`에 "프롬프트에 규칙 톤·축을 넣지 않는다"를 추가했다. README 알고리즘 4절도 고쳤다.
- 수정 후 실측(다시 분석): look-a는 AI 가을웜 딥으로 "측정 판정과 다름", 신뢰도 0.65. look-b는 AI가 톤을 판단하지 않아 0.69.
- `pnpm --filter @celeber/celeb-vibe test` 61개 통과, `typecheck`·`lint` 오류 없음.

## 제한과 미해결

1. `/pocs/celeb-vibe` URL은 없다. 7개 앱이 같은 방식을 쓰도록 오케스트레이터가 정해야 한다. 후보는 허브에 `/pocs/<key>` → `http://<host>:<port>/` 리다이렉트를 두는 방법(앱 변경 없음), 또는 각 앱 `next.config.ts`에 `redirects`로 `/pocs/<key>/:path*` → `/:path*`를 두는 방법이다. basePath는 허브 probe, smoke, 후행 앱 `apiBase`를 모두 바꿔야 해서 권하지 않는다.
2. 퍼스널컬러 톤의 정확도는 사진 한 장으로 보장되지 않는다. 같은 인물을 좌우 반전한 사진에서 측정 경로는 봄웜 라이트, 측정 없는 AI 경로는 여름쿨 라이트(0.36)였다. 규칙 분류와 AI가 자주 다르므로 신뢰도와 "참고용" 표시가 중요하다. HIL에서 사람이 판정해야 한다.
3. 일러스트(`not-photo`)여도 톤을 참고용으로 표시한다. celeb-vibe-report는 `partial.personalColor`가 false면 축을 쓰지 않으므로 갭 계산에는 영향이 없다. 흑백처럼 톤을 아예 비울지는 정해야 한다.
4. dev 모드에서 MediaPipe wasm이 `INFO: Created TensorFlow Lite XNNPACK delegate for CPU.`를 `console.error`로 찍는다. Next dev 오버레이에 "2 Issues"가 뜨고 스크린샷에 보인다. 프로덕션에는 없다. 고치려면 `@celeber/ui` MediaPipe 로더에서 해야 한다(UI: 제안만).
5. 측정 없이 사진 통계로 사전 판정하면 precheck는 퍼스널컬러를 참고용(`partial.personalColor=false`)으로 표시하지만, AI가 사진을 본 뒤에는 가능(true)으로 바뀐다. README에 적힌 의도된 동작이다.
6. headless SwiftShader에서는 브라우저 측정에 약 20초가 걸린다. 실제 기기 GPU에서는 더 빠를 것으로 보이지만 측정하지 않았다.
7. Anthropic은 12/1까지 사용 한도로 막혀 있다. 이번 결과는 모두 OpenAI `gpt-6.2-sol`이 만들었고, Claude 응답 품질은 확인하지 못했다.

## 스크린샷 (`shots/`)

| 파일 | 화면 |
|---|---|
| `celeb-vibe-01-home.png` | 새 분석 첫 화면 |
| `celeb-vibe-02-precheck-a.png`, `-b.png` | 분석 가능 여부 |
| `celeb-vibe-03-analyzing.png` | 분석 중 오버레이 |
| `celeb-vibe-04-result-a.png`, `-b.png` | 결과 상세 전체(수정 전) |
| `celeb-vibe-05-list.png` | 분석 기록 목록 |
| `celeb-vibe-06-not-photo.png` | 일러스트 분석 불가 결과 |
| `celeb-vibe-07-ai-only.png` | 측정 없이 AI만 쓴 결과 |
| `celeb-vibe-08-pc-after-fix.png` | 수정 후 퍼스널컬러(신뢰도 65%) |

## 종료

3104 dev 서버를 종료했다(LISTEN 없음). 3102·3103·3105·3106에 떠 있는 서버는 다른 작업의 것이라 그대로 두었다.
