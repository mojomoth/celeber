# 최소 API 계약

PoC 앱들이 노출하는 Route Handler의 요청·응답 형태다. 2026-11-24에 코드에서 직접 읽었다. 새 계약을 만들지 않고 이 형태를 Gate 1~2의 기준으로 고정한다. 바꿀 때는 이 문서와 [log.md](log.md)를 함께 고친다.

## 공통

- 런타임: 모든 라우트가 `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`이다.
- 앱과 포트: hub 3100, camera-face 3101, camera-body 3102, search-celeb 3103, celeb-vibe 3104, personal-color-report 3105, celeb-vibe-report 3106. 모든 앱이 같은 SQLite(`pocs/.data`, `CELEBER_DATA_DIR`로 변경)를 쓴다.
- 통합 앱은 3108에서 `apps/web/app/api/[...path]/route.ts`에 등록된 경로를 같은 계약으로 제공한다. 추구미 화면의 `/muse/api`는 공유 PoC 흐름을 사용하면서 데모 사진과 데모 인물 데이터를 화면에서 제외한다.
- 요청 본문: JSON을 zod로 검증한다. 실패하면 400 `invalid_json` 또는 `validation_error`(`details`에 zod issues)를 돌려준다. [http.ts](../../pocs/core/src/server/http.ts)
- 오류 형태: `{ error: { code, message, details? } }` ([ApiErrorSchema](../../pocs/core/src/contracts/common.ts)). 404는 `not_found`, 처리되지 않은 예외는 500 `internal_error`다.
- 전체 삭제: `?confirm=1`이 없으면 400 `confirm_required`다. vibe만 본문 `{ confirm: true }`를 받는다.
- AI 출처: face·report·guide 생성 응답에는 `aiSource: 'ai' | 'mock' | 'skipped'`가 있다. vibe 응답(`{ analysis, warning? }`)에는 없으므로 저장 결과의 `source`([ResultSource](../../pocs/core/src/contracts/common.ts): rules·ai·mock·hybrid)와 `isMock`으로 판단한다.
- 접근 제어는 로컬을 기본 허용하며, 다른 사이트에서 온 상태 변경 요청을 거부한다. 통합 앱의 운영 환경에서는 `/access`에 접속 코드를 입력해 12시간 동안 유효한 세션을 발급받는다. [공용 접근 제어](../../pocs/core/src/server/access.ts), [통합 앱 프록시](../../apps/web/proxy.ts)

## 앱별 노출 경로

| 경로 | 노출하는 앱 |
|---|---|
| `/api/health`, `/api/meta`, `/api/uploads` | hub를 뺀 6개 앱 (hub는 health와 `/api/status`) |
| `/api/face/*` | camera-face, personal-color-report, celeb-vibe-report |
| `/api/body/*` | camera-body, personal-color-report, celeb-vibe-report |
| `/api/celeb/*`, `/api/public-image/[id]` | search-celeb, celeb-vibe-report |
| `/api/vibe/*` | celeb-vibe, celeb-vibe-report |
| `/api/report/*` | personal-color-report, celeb-vibe-report |
| `/api/guide/*` | celeb-vibe-report |

재노출은 `app/api/.../route.ts`가 각 PoC의 `src/routes/index.ts` 함수를 그대로 export하는 방식이다.

## 공용

| 메서드·경로 | 요청 | 응답 |
|---|---|---|
| GET `/api/health` | 없음 | `{ app, db: DbHealth, capabilities }` |
| GET `/api/meta` | 없음 | `Capabilities` `{ ai, aiProvider, imageSearch, reverseImageSearch, reverseImageSearchUploads, model, forceMock, aiBlockedReason }` ([env.ts](../../pocs/core/src/server/env.ts)) |
| POST `/api/uploads` | multipart `file`(필수)·`kind`, 또는 JSON `{ dataUrl, kind? }`. 최대 25MB | [UploadRecord](../../pocs/core/src/contracts/upload.ts). 오류: 413 `too_large`(25MB 초과), 400 `unsupported_type`(JPEG·PNG·WebP가 아님)·`upload_failed`(잘린 multipart), 422 `unreadable`(디코딩 실패)·`too_many_pixels`(약 4000만 화소 초과)·`svg_not_allowed`(얼굴·환경 kind에 SVG). 메시지는 모두 한국어다 |
| GET `/api/uploads/[id]` | 없음 | 이미지 바이트 |
| GET `/api/status` (hub) | 없음 | `{ hub, db, pocs[], allRunning }` |

## /api/face (camera-face)

요청·응답 스키마: [camera-face/src/lib/api.ts](../../pocs/camera-face/src/lib/api.ts)

| 메서드·경로 | 요청 | 응답 |
|---|---|---|
| POST `environment` | `EnvironmentRequest { uploadId, sessionId?, whitePoint?, fromUpload?, skipAi? }` | `EnvironmentResponse { sessionId, environment, metrics, whiteReference, aiSource, warning? }` |
| POST `analyze` | `AnalyzeRequest { sessionId?, front, side?, label?, skipAi? }`. front·side는 랜드마크 468~478점과 yaw·pitch·roll, quality | `AnalyzeResponse { sessionId, session, analysis: FaceAnalysis, aiSource, warning? }` |
| GET `sessions` | `?status=complete\|in-progress\|failed&limit=` | `{ sessions: FaceSessionSummary[] }` |
| DELETE `sessions` | `?confirm=1` | `{ deleted }` |
| GET·DELETE `sessions/[id]` | 없음 | `FaceSession` / `{ deleted: 1 }` |
| GET `latest` | 없음 | `{ sessionId, analysis: FaceAnalysis }` |

## /api/body (camera-body)

스키마: [camera-body/src/lib/types.ts](../../pocs/camera-body/src/lib/types.ts)

| 메서드·경로 | 요청 | 응답 |
|---|---|---|
| POST `analyze` | `{ analysis: BodyAnalysis, label?, outfitColors?, describeOutfit? }`. 측정은 브라우저(MediaPipe)가 한다 | `{ session: BodySession, outfit: OutfitMeta \| null }` |
| POST `demo` | 없음 | 위와 같음 (Mock 세션) |
| GET `sessions` | `?limit=` | `{ items: BodySessionListItem[] }` |
| DELETE `sessions` | `?confirm=1` | `{ deleted }` |
| GET·DELETE `sessions/[id]` | 없음 | `{ session, outfit }` / `{ deleted: 1 }` |

## /api/celeb (search-celeb)

타입: [search-celeb/src/lib/types.ts](../../pocs/search-celeb/src/lib/types.ts), 요청 검증: [routes/index.ts](../../pocs/search-celeb/src/routes/index.ts)

| 메서드·경로 | 요청 | 응답 |
|---|---|---|
| GET `suggest` | `?q=` | `SuggestResponse { query, items }` (외부 호출 없음) |
| GET `search` | `?q=` (1~60자) | `SearchResponse { query, candidates, origin, isMock, imageProvider, warning?, notices }` |
| POST `identify` | `{ uploadId }` | `IdentifyResponse { upload, reverse, photoText, photoCheck, candidates, needsNameSearch, isMock, notices }` (얼굴 인식 없음) |
| GET `celebs` | `?saved=1&limit=` | `{ items: CelebSummary[] }` |
| POST `celebs` | `{ candidate: CelebCandidate }` | `{ celeb: CelebProfile }` |
| GET `celebs/[id]` | 없음 | `CelebDetailResponse { celeb, images: { signature, recent, daily } }` |
| PATCH `celebs/[id]` | `{ saved }` | `{ celeb }` |
| DELETE `celebs/[id]` | 없음 | `{ deleted, images }` |
| GET `celebs/[id]/images` | 없음 | `{ celebId, images }` |
| POST `celebs/[id]/images` | `{ category: 'signature'\|'recent'\|'daily', refresh? }` | `CollectImagesResponse { celebId, category, images, queries, added, failed, provider, judge, isMock, notices }` |
| PATCH `images/[id]` | `{ selected }` | `{ image: CelebImage }` |

`/api/public-image/[id]?exp&sig`는 Lens 역검색용으로 서명된 이미지 한 장만 토큰 없이 내준다.

## /api/vibe (celeb-vibe)

요청 스키마: [celeb-vibe/src/lib/summary.ts](../../pocs/celeb-vibe/src/lib/summary.ts), 결과 타입: [server/index.ts](../../pocs/celeb-vibe/src/server/index.ts)

| 메서드·경로 | 요청 | 응답 |
|---|---|---|
| POST `precheck` | `{ uploadId, measurement? }` | `{ analyzability: Analyzability, measured, measurementDropped }` (AI 없음) |
| POST `analyze` | `{ uploadId, celebName?, celebId?, celebImageId?, measurement?, force? }` | `{ analysis: VibeAnalysis, warning? }` |
| POST `import-url` | `{ url }` (공개 http·https만) | `{ image: ImageRef }` (400 `unsafe_url`, `fetch_failed`) |
| GET `analyses` | `?celebId=&limit=` 또는 `?preview=reset` | `{ items: VibeAnalysisSummary[] }` / `{ analyses, referencedByGuides }` |
| DELETE `analyses` | 본문 `{ confirm: true }` | `{ deleted }` |
| GET·PATCH·DELETE `analyses/[id]` | PATCH `{ celebName?, lookName? }` | `VibeAnalysis` / `VibeAnalysis` / `{ deleted: 1 }` |
| POST `analyses/[id]/reanalyze` | 없음 | `{ analysis, warning? }` |
| GET `celeb-images` | 없음 | `{ items: CelebImageOption[] }` (search-celeb이 저장한 사진) |

`measurement`는 브라우저 측정값이다: [measurement.ts](../../pocs/celeb-vibe/src/lib/measurement.ts)의 `VibeMeasurementSchema`.

## /api/report (personal-color-report)

스키마: [personal-color-report/src/lib/api.ts](../../pocs/personal-color-report/src/lib/api.ts)

| 메서드·경로 | 요청 | 응답 |
|---|---|---|
| POST `generate` | `{ faceSessionId, bodySessionId?, gender?, skipAi? }` | `{ report: PersonalColorReport, aiSource, warning? }` |
| GET `inputs` | 없음 | `{ face: InputFace[], body: InputBody[] }` |
| GET `reports` | `?limit=` | `{ reports: PersonalColorReportSummary[] }` |
| DELETE `reports` | `?confirm=1` | `{ deleted }` |
| GET·PATCH·DELETE `reports/[id]` | PATCH `{ gender: 'male'\|'female'\|'unspecified' }` | `PersonalColorReport` / `PersonalColorReport` / `{ deleted: 1 }` |
| GET `latest` | 없음 | `PersonalColorReport` |

## /api/guide (celeb-vibe-report)

스키마: [celeb-vibe-report/src/lib/api.ts](../../pocs/celeb-vibe-report/src/lib/api.ts), 목록 타입: [lib/types.ts](../../pocs/celeb-vibe-report/src/lib/types.ts)

| 메서드·경로 | 요청 | 응답 |
|---|---|---|
| POST `generate` | `{ reportId, vibeAnalysisId, skipAi?, saved? }` | `{ guide: VibeGuide, aiSource, warning? }` |
| GET `guides` | `?saved=1&limit=&reportId=` 또는 `?preview=reset` | `{ items: GuideSummary[] }` / `{ count, items }` |
| DELETE `guides` | `?confirm=1` | `{ deleted }` |
| GET·PATCH·DELETE `guides/[id]` | PATCH `{ saved?, lookName? }` | `VibeGuide` / `VibeGuide` / `{ deleted: 1 }` |
| POST `guides/[id]/regenerate` | `{ skipAi? }` | `{ guide, aiSource, warning? }` (같은 id) |
| GET `reports` | `?limit=` | `{ items: MyReportBrief[] }` |
| GET `my-data` | 없음 | `{ counts, photos, items, kept }` (초기화 미리보기) |
| DELETE `my-data` | `?confirm=1` | `{ deleted: Record<string, number>, photos }` |

## 핵심 저장 계약

모두 [pocs/core/src/contracts/](../../pocs/core/src/contracts/index.ts)의 zod 스키마다. 최상위 필드만 적는다(`?`는 선택).

| 스키마 | 최상위 필드 |
|---|---|
| [FaceAnalysis](../../pocs/core/src/contracts/face.ts) | version, createdAt, environment, front, side?, skin, featureColors, geometry, ai?, source, isMock, warnings |
| [FaceSession](../../pocs/core/src/contracts/face.ts) | id, createdAt, updatedAt, status, label?, analysis?, partial? |
| [BodyAnalysis](../../pocs/core/src/contracts/body.ts) | version, createdAt, status, failureReasons, image?, fromUpload?, landmarks?, keypoints?, ratios?, frame?, skeleton?, silhouette?, posture?, insights, stylingHints, outfitDescription?, source, isMock |
| [CelebProfile](../../pocs/core/src/contracts/celeb.ts) | id, createdAt, updatedAt, name, nameEn?, aliases, description?, thumbnail?, saved, source, isMock |
| [CelebImage](../../pocs/core/src/contracts/celeb.ts) | id, celebId, createdAt, category, query, provider, sourceUrl, pageUrl?, sourceTitle?, cached?, thumbnailUrl?, width?, height?, isFullBody, analyzable, reasons, selected, isMock |
| [VibeAnalysis](../../pocs/core/src/contracts/vibe.ts) | id, version, createdAt, image, celebName?, celebId?, celebImageId?, analyzability, outfit, personalColor, mood, body?, palette, lookName, source, isMock, model? |
| [PersonalColorReport](../../pocs/core/src/contracts/personal-color.ts) | id, version, createdAt, updatedAt, source, isMock, faceSessionId, bodySessionId, header, variant, photos, measurements, classification, aiOpinion?, firstImpression, type, warmCool, features, draping, tops, outer, accessories, hair, grooming, avoidStyles, todayActions, cautions, confidence, bodyStyling, disclaimer |
| [VibeGuide](../../pocs/core/src/contracts/vibe-guide.ts) | id, version, createdAt, updatedAt, reportId, vibeAnalysisId, celebId?, celebName, lookName, thumbnail?, summary, face, outfit, mood, paletteMapping, gaps, actions, doNotCopy, limitations?, saved, source, isMock |
| [ImageRef](../../pocs/core/src/contracts/common.ts) | uploadId, url, width?, height?, sourceUrl? |
