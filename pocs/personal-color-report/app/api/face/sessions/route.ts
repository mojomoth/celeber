// 이 앱은 얼굴 세션을 조회만 한다. 삭제는 camera-face 앱에서 (다른 PoC 테이블의 파괴적 경로를 넓히지 않음).
export { sessionsGET as GET } from '@celeber/camera-face/routes';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
