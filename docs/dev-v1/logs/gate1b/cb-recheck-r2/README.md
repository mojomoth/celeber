# camera-body 독립 재검증 라운드 2 (cb-fix-r4 수정분, 2026-11-24)

- 실행: 3102 dev를 새로 띄움(FORCE_MOCK 없음, 빈 스크래치 데이터), Playwright 헤드리스 430×932, 작업 후 종료(3100~3106 리슨 없음 확인). `pnpm test` 101/101, typecheck·lint 0.
- 입력: 라운드 1 입력 49종(cbv4/in) 회귀 + 새 합성 사진 18장(gpt-image-2: 의자·바스툴·책상 끝·바닥 양반다리·스쿼트·무릎 꿇기·맥시 원피스·무릎 위 가방·노트북·다리 꼰 앉은 자세, 실크햇·선바이저·하이 포니테일·아프로·베레모, 걷기·짝다리·발목 교차 선 자세) + look-b·g-nohat·n-visor ±10·11° 회전.
- 판정: **PASS** (major 0, minor 4)

## 직전 이슈 확인

| 이슈 | 결과 |
|---|---|
| major 앉은 정면 사진 complete | 해결. 앉은 사진 13장(g-sit·g-sit2·g-sit-rot10 포함)이 모두 not-standing으로 실패한다(바닥 양반다리는 feet-unclear도 함께, 무릎 꿇기는 feet-unclear). g-sit2는 '측정 실패 상태로 기록' 후 POST 200. 서 있는 짝다리·걷기·발목 교차는 complete(7.1·8.2·8.1)로 오탐 없음 |
| major 폼폼·올림머리 정수리 | 해결. g-pompom2 6.9(저장 200, AI는 Anthropic 한도 400 → OpenAI, is_mock 0), g-beanie 6.9, g-bun 7.1. 새 사진은 실크햇 6.8, 선바이저 6.9, 포니테일 7.1, 아프로 7.7이고 모두 정수리 경고가 붙는다. 정수리 선은 눈~턱×2.1 위치로 모자 속 실제 정수리 근처(실크햇 147px, 눈으로 추정한 값 약 155px) |
| minor 회전 비대칭 | 대부분 해결(±12·16° 실패, ±5·8° 경고). 10~11° 경계에 비대칭이 남음(아래 1) |
| minor 팔/키 28~30% '낮음' | 해결. 선 사진 31장 28~32%, 모두 '범위 안' |
| minor 0.945 표시·판정 | 비율 상세는 해결. 요약 칩에 같은 종류의 불일치가 남음(아래 2) |
| minor 밀착 비니·야구모자 경고 없음 | 그대로(수정자가 경고 규칙 대신 촬영 안내 추가). g-beanie2 8.1 '범위보다 높음', g-cap 8.0, 베레모 8.0 경고 없음 |

회귀: 잘림(위·옆·발)·90° 회전·사람 없음(단색·노이즈)·HEIC·PDF·가짜 JPG 안내, 흑백·어두운 사진, 두 사람 경고는 라운드 1과 같다. look-b 계열 7.8~7.9.

## 남은 이슈 (minor)

1. 10~11° 회전에 방향 비대칭이 남는다. +10°는 look-b·g-nohat·n-visor 셋 다 camera-tilted 실패, −10°는 셋 다 complete에 8~9° 경고. −11°는 look-b만 실패. `cameraTiltDeg`가 사람 자세 기울기를 평균에 그대로 남긴다(analyze.ts:309).
2. 요약 칩의 어깨/골반이 `toFixed(2)`를 쓴다(BodyResultView.tsx:111). look-a-pad에서는 칩이 1.32인데 비율 상세는 1.33이다. 1.305는 `toFixed`로 1.30, `displayedValue`로 1.31이 된다.
3. not-standing 검사와 thighToShin은 양쪽 무릎 visibility가 0.5 이상일 때만 돈다(analyze.ts:617). g-sit·g-sit2 픽스처에서 무릎 하나만 0.49로 바꾸면 complete(6.6·6.2등신, knees-hidden 경고)가 된다(`knee-hidden.probe.test.ts`). 실제 사진에서는 재현하지 못했다. 무릎 위 가방·노트북·맥시 원피스 사진도 모두 not-standing으로 실패했다. 실측 무릎 visibility는 0.99다.
4. 밀착 비니·야구모자·베레모에는 정수리 경고가 없다(위 표).

Codex 2차 의견: `codex-second-opinion.txt`. 그중 어깨 24°·골반 4° 합성 좌표와 폼폼 이마 점 조작 2건은 실제 입력으로 재현하지 않았고 채택하지 않았다.
스크린샷: `v2-*.png`. 정수리 위치 확인은 `v2-headtop-*`, 값 표는 `verdicts.txt`에 있다.
