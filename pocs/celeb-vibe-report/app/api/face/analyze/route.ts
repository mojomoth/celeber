// camera-face의 ./routes 엔트리를 같은 경로로 재노출 (통합 단계에서 workspace 의존성으로 전환).
// personal-color-report 리포트 생성 플로우(카메라 촬영 경로)를 이 앱 안에 임베드하기 위해 필요하다.
export { analyzePOST as POST } from '@celeber/camera-face/routes';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
