# Gate 1b: core data URL·업로드 오류 처리 독립 재검증 (라운드 2, 2026-11-24)

판정: **PASS** (major 0, minor 5). 검증자는 코드를 고치지 않았다.

## 실행
- `pnpm test` exit 0: core 132(1 skip), hub 5, camera-body 89, search-celeb 56(9 skip), celeb-vibe 95, camera-face 59, pcr 57(1 skip), cvr 65(6 skip). 합계 558 통과, 17 건너뜀.
- dev 서버 3104(celeb-vibe)와 3101(camera-face)을 `CELEBER_DATA_DIR=<scratchpad>`로 띄웠다. 3101은 다른 세션이 쓰던 서버가 내려간 뒤에 띄웠다. `POST /api/uploads` 53개 사례를 두 앱에 보냈고, 27MB 하나만 빼고 결과가 같았다. 끝난 뒤 두 서버 모두 종료했다.
- dev 로그에 `TypeError`, `upload error`, 500이 없다.

## 라운드 1 이슈 확인
- 해결(major): `dataUrl`이 `{toString:null}`, `{toString:1}`, `123`, `true`, `{}`, 배열이면 400 `bad_request` "dataUrl은 문자열이어야 합니다."가 나온다. 500이 사라졌다.
- 해결: JSON 안의 잘못된 UTF-8은 400 `invalid_json`이 된다.
- 해결: 일반적으로 잘린 JPEG/PNG/WebP(앞 50%·90%)를 face-front·face-side·environment로 보내면 422 `unreadable`이 나온다. vibe·other kind는 설계대로 200이다.
- 해결: 9000x5000 SVG를 vibe로 올리면 업로드 200, precheck 200(384x213)이다.
- 그대로: `%ZZ`, `%E0%A4`, 잘못된 mime 문자, `data:;base64`, data URL 아님 → 400. 빈 payload와 비이미지 → 400 `unsupported_type`. 깨진 JPEG·SVG → 422 `unreadable`. 8000x8000 PNG → 422 `too_many_pixels`. 사진 전용 kind에 SVG → 422 `svg_not_allowed`. 문구는 모두 한국어다.
- 정상 업로드 회귀 없음: base64 JPEG/PNG, 퍼센트·base64 SVG, multipart JPEG/PNG/WebP/SVG, octet-stream으로 선언한 JPEG 모두 200이고 `GET /api/uploads/<id>`도 200이다.

## 남은 이슈 (직접 재현한 것만, 모두 minor)
1. 잘린 JPEG 끝에 EOI(`FF D9`)를 붙이면 `failOn:'truncated'`을 통과한다. 640x480 JPEG 앞 50%에 FFD9를 붙여 face-front·face-side·environment로 보내면 두 앱 모두 200이다. 저장본 아래쪽이 (128,128,128) 회색이다.
2. 회귀: 아주 가는 SVG(3000x1, vibe)는 업로드 200이지만 precheck가 404 "업로드 이미지를 읽을 수 없습니다."이다. `svgDensity` 때문에 높이가 0px이 된다(svgload "zero-sized image"). density를 쓰지 않던 이전 경로는 384x1을 반환했다. 500x1은 200이다.
3. 남은 문제: 선언 크기가 아주 큰 SVG(500000², 2000000²)는 density를 최소 1로 내려도 픽셀 상한을 넘는다. 업로드는 200, precheck는 404다.
4. 기존 이슈, 앱 소유: camera-face에 27MB를 보내면 400 `upload_failed`, celeb-vibe는 413 `too_large`다.
5. 기존 이슈, 의도된 설계: 선언 MIME을 무시하고 매직 바이트로 판별한다(octet-stream/text/plain + 실제 이미지는 200).

## Codex sol 2차 의견
- 1(EOI 붙인 잘린 JPEG), 2(가는 SVG), 3(거대 SVG)은 직접 재현했다. 500이 아니고 한국어 4xx 또는 저장 품질 문제라서 major가 아니라 minor로 채택했다.
- 채택하지 않았다:
  - 저장 파일을 바꾼 뒤 중복 업로드: 저장소를 직접 바꿔야 해서 API로 재현할 수 없다.
  - 읽기 전용 DB에서 500: 환경 장애이고 한국어 500이 나온다.
  - `normalize:false` 경로: POST에서 쓸 수 없다.
  - SVG 안에 넣은 깨진 PNG, latin-1 JSON: 재현하지 않았다. 영향도 작다.
