# Gate 1b: core data URL·업로드 오류 처리 (라운드 2, 2026-11-24)

수정 파일: `pocs/core/src/server/uploads.ts`, `pocs/core/test/server.test.ts`. 테스트를 먼저 넣어 9건 실패(500/200/null)를 재현한 뒤 고쳤다.

- major·minor(배열): 문자열이 아닌 `dataUrl`이 들어오면 `handleUploadPost`가 400 `bad_request` 'dataUrl은 문자열이어야 합니다.'로 응답한다. `saveUploadFromDataUrl`도 같은 경우 `UploadError(400)`를 던진다. `{toString:null}`, `{toString:1}`, `123`, `true`, 배열 모두 400이다.
- 잘린 JPEG: `face-front`/`face-side`/`environment`(RASTER_ONLY_KINDS)에만 `failOn:'truncated'`를 적용해 422 `unreadable`로 거절한다. 다른 kind와 원격 캐시는 기존처럼 관대하게 디코드한다. 온전한 JPEG는 face-front에서 200이다.
- 큰 SVG: (b) 방식을 택했다. 목업 SVG는 계속 받고, `readUploadPixels`가 긴 변이 maxEdge 정도가 되는 density로 렌더한다. 9000x5000 SVG도 픽셀을 읽을 수 있어 precheck가 404를 내지 않는다(앱에서 재확인 필요).
- 잘못된 UTF-8: `TextDecoder('utf-8',{fatal:true})`를 써서 400 `invalid_json`으로 거절한다.
- 선언 MIME 무시와 느슨한 base64는 바꾸지 않았다. 매직 바이트로 판별하는 설계이고, FileReader가 `application/octet-stream`으로 보내는 정상 사진이 있어서다.
- camera-face 27MB→400은 `next.config.ts`(앱 소유)라 이번 범위가 아니다.
- 확인: core 132 통과(1 skip), typecheck·lint exit 0. 루트 `pnpm test` exit 0. dev 서버는 띄우지 않았다.
