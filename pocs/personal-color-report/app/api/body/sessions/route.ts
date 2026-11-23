// 이 앱은 전신 세션을 조회만 한다. 삭제는 camera-body 앱에서 (다른 PoC 테이블의 파괴적 경로를 넓히지 않음).
export { sessionsGET as GET } from '@celeber/camera-body/routes';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
