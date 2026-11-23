// 'use client' 컴포넌트: 촬영/입력 플로우 (onComplete 콜백으로 결과 반환).
// 다른 PoC 앱이 "@celeber/personal-color-report/flow"로 import한다.
// 규칙: 이 폴더 아래 코드는 '@/...' 경로 별칭을 쓰지 말고 상대경로로 import한다.
//       API 호출은 apiBase prop(기본 '')을 앞에 붙여 '/api/report/...'로 보낸다.
export {
  PersonalColorReportFlow,
  generateReport,
  fetchReportInputs,
  type PersonalColorReportFlowProps,
  type ReportFlowResult,
} from './PersonalColorReportFlow';
export { ReportViewer, type ReportViewerProps } from './ReportViewer';
