// 'use client' 컴포넌트: 추구미 가이드 플로우 (onComplete 콜백으로 결과 반환).
// 다른 PoC 앱이 "@celeber/celeb-vibe-report/flow"로 import한다.
// 규칙: 이 폴더 아래 코드는 '@/...' 경로 별칭을 쓰지 말고 상대경로로 import한다.
//       API 호출은 apiBase prop(기본 '')을 앞에 붙여 '/api/guide/...'로 보낸다.
//       호스트는 /api/guide/*, /api/celeb/*, /api/vibe/*, /api/uploads 를 재노출해야 한다
//       (리포트 만들기까지 임베드하면 /api/report/*, /api/face/*, /api/body/* 도).
export { VibeGuideFlow, analyzabilityReasonText, type VibeGuideFlowProps } from './VibeGuideFlow';
export { GuideViewer, type GuideViewerProps } from './GuideViewer';
