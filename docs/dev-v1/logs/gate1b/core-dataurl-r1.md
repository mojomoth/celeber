# Gate 1b: core data URL 오류 처리 (라운드 1, 2026-11-24)

- 재현: `POST /api/uploads` JSON `{"dataUrl":"data:image/svg+xml,%ZZ"}` → 500 `upload_failed` (decodeURIComponent URIError). 새 테스트가 수정 전 500으로 실패하는 것을 확인했다.
- 수정: `pocs/core/src/server/uploads.ts` `saveUploadFromDataUrl`에서 퍼센트 디코딩 실패를 잡아 400 `bad_request` '사진 데이터(data URL) 형식이 올바르지 않습니다.'로 낸다. 다른 경로는 그대로다.
- 테스트(`pocs/core/test/server.test.ts`) 3건: `%ZZ`, 잘린 UTF-8 시퀀스 → 400 한국어(영문 원문 없음), 정상 퍼센트 인코딩 SVG → 200.
- 확인: core test 120 통과(1 skip), typecheck·lint exit 0. 루트 `pnpm test` exit 0 (core 120, hub 5, camera-body 89, search-celeb 52, celeb-vibe 89, camera-face 50, pcr 51, cvr 65).
- dev 서버는 띄우지 않았다.

## 남은 core 업로드 이슈 (core-recheck 기준, 이번에 고치지 않음)

- 선언 크기가 큰 SVG(예: 9000x5000)를 `kind=vibe` 등으로 올리면 200 저장, 이후 `readUploadPixels`는 픽셀 상한으로 null → celeb-vibe 404. 목업 SVG를 크기 제한 없이 받는 것은 이전 수정의 의도라 결정이 필요하다: (a) 저장 때 SVG에도 픽셀 상한 적용(422), (b) `readUploadPixels`에서 SVG를 낮은 density로 렌더, (c) 앱이 null을 422로 변환(앱 소유).
- camera-face 27MB → 400(next.config 본문 상한, 앱 소유), celeb-vibe null → 404(앱 소유): 기존 지적 그대로.
- 참고: `pocs/core/src/server/access.ts:52` 쿠키 값도 같은 `decodeURIComponent` 패턴이라 잘못된 쿠키에서 예외가 난다(업로드 밖이라 손대지 않음).
