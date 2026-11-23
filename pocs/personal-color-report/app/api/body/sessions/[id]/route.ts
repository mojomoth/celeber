// 조회 전용 재노출 (삭제는 camera-body 앱에서).
export { sessionGET as GET } from '@celeber/camera-body/routes';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
