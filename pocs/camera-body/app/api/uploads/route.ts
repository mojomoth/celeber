import { handleUploadPost } from '@celeber/core/server/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** multipart/form-data: file(필수), kind(선택) → UploadRecord JSON */
export function POST(req: Request) {
  return handleUploadPost(req);
}
