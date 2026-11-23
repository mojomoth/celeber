# Gate 1b: core data URL·업로드 오류 처리 독립 재검증 (라운드 1, 2026-11-24)

판정: **FAIL** (major 1). 검증자는 파일을 고치지 않았다.

## 실행
- `pnpm test` exit 0: core 120(1 skip), hub 5, camera-body 89, search-celeb 56(9 skip), celeb-vibe 89, camera-face 50, pcr 51(1 skip), cvr 65(6 skip). 합계 525 통과, 17 건너뜀.
- dev 서버 3101(camera-face)·3104(celeb-vibe)를 `CELEBER_DATA_DIR=<scratchpad>`로 띄워 `POST /api/uploads` 41개 사례를 두 앱에 같은 결과로 확인. 끝나고 종료(3102·3106은 다른 세션 프로세스라 두었다).

## 통과 (두 앱 동일)
- `%ZZ`, `%E0%A4`, 인코딩 안 한 `100%` SVG, `;charset=…;base64`, `;utf8`, `data:;base64`, data URL 아님 → 400 `bad_request` "사진 데이터(data URL) 형식이 올바르지 않습니다."
- 빈 payload(base64·SVG), base64 아닌 문자만, text/plain 비이미지, 텍스트 파일, 빈 파일 → 400 `unsupported_type`
- 깨진 JPEG(헤더+쓰레기), 잘린 PNG(40B), 깨진 SVG XML → 422 `unreadable`
- 8000x8000 PNG → 422 `too_many_pixels` "약 4000만 화소를 넘습니다"
- SVG + `face-front`/`environment` → 422 `svg_not_allowed`
- JSON 깨짐 400 `invalid_json`, `null`/빈 문자열 400, `file` 없음 400. 오류 응답 모두 한국어, 영문 원문 없음.
- 정상: base64 JPEG/PNG, 퍼센트·base64 SVG, multipart JPEG/PNG/SVG → 200, `GET /api/uploads/<id>` 200. 회귀 없음.

## 이슈 (직접 재현한 것만)
- **major** `dataUrl`이 문자열이 아니면 500: `{"dataUrl":{"toString":null}}`, `{"dataUrl":{"toString":1}}` → 500 `upload_failed`(로그 `TypeError: Cannot convert object to primitive value` at uploads.ts:199). `handleUploadPost`가 존재만 검사(uploads.ts:325). 수정 방향: `typeof body.dataUrl !== 'string'`이면 400.
- minor 같은 원인: `{"dataUrl":["data:image/png;base64,…"]}` 배열이 문자열로 바뀌어 200 저장.
- minor 잘린 JPEG 저장: 640x480 JPEG 앞 50%만 multipart(kind=face-front) → 200, 640x480로 저장(`failOn:'none'`, uploads.ts:156). 아주 작은 JPEG(161B)는 422. 얼굴 분석 입력으로는 엄격화(`failOn:'truncated'` 등) 검토 필요.
- minor(기존, 결정 대기) 9000x5000 SVG kind=vibe → 업로드 200, celeb-vibe `/api/vibe/precheck` → 404 "업로드 이미지를 읽을 수 없습니다."
- minor 선언 MIME 무시: `data:text/plain;base64,<PNG>`, `data:image/x-bogus;base64,<JPEG>`, base64 중간 `!` → 200(매직 바이트 판별, 의도된 동작에 가깝다).
- minor(기존, 앱 소유) camera-face 27MB → 400 `upload_failed` "끝까지 읽지 못했습니다"(celeb-vibe는 413 `too_large`).
- minor JSON 본문의 잘못된 UTF-8 바이트(SVG `<title>` 안 E0 A4) → U+FFFD로 바뀌어 200 저장. 영향 작음.

## Codex sol 2차 의견
major 3·minor 2 제시. 비문자열 dataUrl 500은 재현해 major로 채택. 잘린 JPEG·거대 SVG는 재현했으나 500이 아니고 한국어 4xx/의도된 관대 디코딩·결정 대기라 minor로 낮췄다. MIME·base64 느슨함, 잘못된 UTF-8도 재현해 minor로 채택.
