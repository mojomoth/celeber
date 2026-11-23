// 'use client' 컴포넌트: 촬영/입력 플로우 (onComplete 콜백으로 결과 반환).
// 다른 PoC 앱이 "@celeber/camera-face/flow"로 import한다.
// 규칙: 이 폴더 아래 코드는 '@/...' 경로 별칭을 쓰지 말고 상대경로로 import한다.
//       API 호출은 apiBase prop(기본 '')을 앞에 붙여 '/api/face/...'로 보낸다.
export { FaceCaptureFlow, type FaceCaptureFlowProps, type FaceCaptureResult } from './FaceCaptureFlow';
export { useCamera, useLiveFace, useLiveBrightness, type Facing, type LiveFaceState } from './hooks';
export { buildDraft, captureVideoFrame, fileToCanvas, detectFaceOnCanvas, segmentCanvas, uploadCanvas, faceLumaOf, type CaptureDraft, type CapturePose } from './vision';
export { postAnalyze, postEnvironment } from './api';
