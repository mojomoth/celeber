/** multipart/form-data: file(필수), kind(선택) → UploadRecord JSON. 파싱 실패는 한국어 오류로 바꾼다. */
export { uploadPOST as POST } from '../../../src/routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
