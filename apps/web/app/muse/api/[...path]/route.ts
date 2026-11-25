import { GET as dispatch, POST, PATCH, DELETE } from '../../../api/[...path]/route';
import { liveMuseRequest, liveMuseResponse } from '../../../../src/muse/live-api';
import { jsonError, withErrors } from '@celeber/core/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const methods = { GET: dispatch, POST, PATCH, DELETE };

const live = withErrors(async (request: Request, context: { params: Promise<{ path: string[] }> }) => {
  const { path } = await context.params;
  const handler = methods[request.method as keyof typeof methods];
  if (!handler || !['uploads', 'celeb', 'vibe', 'guide'].includes(path[0]) || new URL(request.url).searchParams.has('preview')) {
    return jsonError(404, 'not_found', '요청한 경로가 없어요.');
  }
  const input = await liveMuseRequest(request, path);
  if (input instanceof Response) return input;
  const output = await liveMuseResponse(request.method, path, await handler(input, context));
  output.headers.set('Cache-Control', 'private, no-store');
  return output;
});

export { live as GET, live as POST, live as PATCH, live as DELETE };
