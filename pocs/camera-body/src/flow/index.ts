// 'use client' 컴포넌트: 촬영/입력 플로우 (onComplete 콜백으로 결과 반환).
// 다른 PoC 앱이 "@celeber/camera-body/flow"로 import한다.
// 규칙: 이 폴더 아래 코드는 '@/...' 경로 별칭을 쓰지 말고 상대경로로 import한다.
//       API 호출은 apiBase prop(기본 '')을 앞에 붙여 '/api/uploads', '/api/body/analyze'로 보낸다.
export { BodyCaptureFlow, errorMessage, type BodyCaptureFlowProps, type BodyFlowResult } from './BodyCaptureFlow';
export { analyzeBodyImage, loadImage, type AnalyzeBodyImageOptions, type BrowserBodyResult } from './analyzeBodyImage';
