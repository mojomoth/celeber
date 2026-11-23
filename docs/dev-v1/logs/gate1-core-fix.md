# Gate 1: pocs/core 공용 수정

- 일시: 2026-11-24
- 대상: 검증자 보고 core 이슈 12건 → 중복을 빼면 5건
- 공급자(AI·검색) 호출 경로는 바꾸지 않아 실제 호출 재확인은 하지 않았다.

## 수정

| # | 이슈 | 파일 | 수정 |
|---|---|---|---|
| 1 | 업로드 오류가 sharp·libheif·Next 원문(영문)으로 나감. 25MB 초과 문구가 경로마다 다름. 서버가 안내하는 형식(7종)이 화면 안내(3종)와 다름 | `pocs/core/src/server/uploads.ts` | `UploadError(status, code, message)`와 `UPLOAD_MESSAGES`를 추가했다. 픽셀 상한 초과는 422 `too_many_pixels`, 디코드 실패는 422 `unreadable`(HEIC는 전용 문구), 형식 불명은 400 `unsupported_type`(JPEG, PNG, WebP 안내), 25MB 초과는 항상 413 `이미지가 너무 큽니다 (최대 25MB).`로 낸다. multipart가 깨지면 400 `upload_failed` 한국어, JSON이 깨지면 400 `invalid_json`, 그 밖의 오류는 500과 한국어 문구로 내고 원문은 서버 로그에만 남긴다 |
| 2 | 깨진 SVG가 200으로 저장된 뒤 environment·analyze에서 500 | `uploads.ts` | SVG는 저장 전에 파싱해 본다. `face-front`, `face-side`, `environment`에는 SVG를 받지 않는다(422 `svg_not_allowed`). `body`, `other` 등 목업용 SVG는 그대로 저장한다 |
| 3 | `readUploadPixels`가 디코드 실패 때 예외를 던져 camera-face의 422 `unreadable` 분기가 실행되지 않음 | `uploads.ts` | 디코드 실패·픽셀 상한 초과 때 `null`을 돌려준다 |
| 4 | ROI 픽셀 상한(6000)이 걸리지 않아 턱이 전체 피부값을 좌우함. 볼이 빠져도 신뢰도 사유에 나오지 않음 | `pocs/core/src/face/sample.ts` | 격자 간격을 `Math.ceil`로 바꿨다. 전체값은 ROI마다 같은 수(최소 1000px)까지만 섞어 균등 가중한다. 빠진 ROI는 `skin.missing`에 담고, 사유(`오른쪽 볼 피부색을 읽지 못해 나머지 3곳으로 계산했습니다…`)를 넣고 1곳이면 0.1, 2곳 이상이면 0.2를 감점한다. 기존 `ROI < 3`일 때만 감점하던 규칙을 대신한다 |
| 5 | 여름쿨 뮤트 ⑧ 추천 '버건디 브라운'과 ⑪ 비추천 '버건디/와인'이 이름만 보면 모순 | `pocs/core/src/personal-color/palettes.ts` | `#3E2C2E`의 이름을 '다크 브라운'으로 바꿨다 |

호출부는 고치지 않았다. 앱마다 있던 문구 변환(`friendlyUploadError`, `bodyUploadErrorMessage`, `photoErrorMessage`, `koreanUploadError`)은 새 문구를 그대로 통과시키거나 같은 뜻으로 바꾼다. 픽셀 초과 문구에는 '너무 큽니다'를 넣지 않아 앱에서 25MB 안내로 잘못 바뀌지 않는다.

## 테스트

- `pocs/core/test/server.test.ts`: 업로드 오류 12건 추가(45MP PNG, 깨진 SVG, 얼굴 kind의 SVG 3종, 가짜 HEIC, 텍스트 파일, 27MB, 잘린 multipart, 깨진 JSON, 손상 파일의 `readUploadPixels` null, 목업 SVG 저장)
- `pocs/core/test/face.test.ts`: ROI 상한, 균등 가중, 누락 사유·감점 3건. 상한·가중 2건은 수정 전 코드(`Math.floor`, 가중 없음)에서 실패하는 것을 확인했다
- 루트 `pnpm test`(core 117 통과, 전 앱 통과), `pnpm typecheck`, `pnpm lint` 모두 exit 0

## camera-face dev 서버 재현 (3101, Mock, 별도 데이터 폴더, 확인 후 종료)

```
trunc.svg kind=none        -> 422 unreadable   "사진 파일을 읽지 못했습니다. 파일이 손상됐을 수 있습니다. …"
ok.svg kind=face-front     -> 422 svg_not_allowed
ok.svg kind=none           -> 200 (image/svg+xml)
px45mp.png (9000x5000)     -> 422 too_many_pixels "사진 해상도가 약 4000만 화소를 넘습니다. …"
text.jpg                   -> 400 unsupported_type "지원하지 않는 이미지 형식입니다. JPEG, PNG, WebP 사진을 올려 주세요."
pad27.jpg (27MB)           -> 400 upload_failed "사진 파일을 끝까지 읽지 못했습니다. 25MB 이하의 사진으로 …"
environment (정상 JPEG)     -> 200
environment (저장 파일 손상) -> 422 unreadable (수정 전 500 internal_error)
```

## 남은 점

- camera-face는 Next 프록시 본문 상한을 올리지 않아 27MB 본문이 잘린다. 그래서 413이 아니라 400 '끝까지 읽지 못했습니다(25MB 이하)'가 나온다. 다른 앱처럼 `next.config`에서 36MB로 맞추면 413이 된다(앱 소유 파일).
- celeb-vibe는 `readUploadPixels`가 `null`이면 404 `upload_not_found`('업로드 이미지를 읽을 수 없습니다')로 낸다. 문구는 맞지만 상태는 422가 더 정확하다(앱 소유 파일).
- search-celeb 보고의 역이미지 검색 안내 문구(사진 글자로 후보를 찾아도 'SERPAPI_API_KEY가 없어…'가 함께 나옴)는 이번 이슈 목록에 없어 손대지 않았다.
