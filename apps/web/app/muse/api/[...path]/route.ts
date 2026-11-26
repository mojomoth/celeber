import { liveMuseRequest, liveMuseResponse } from '../../../../src/muse/live-api';
import { dispatchApiRequest, type ApiContext } from '../../../../src/server/api';
import { withBrowserApi } from '../../../../src/server/browser-api';
import { jsonError, withErrors } from '@celeber/core/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const live = withBrowserApi(withErrors(async (request: Request, context: ApiContext) => {
  const { path } = await context.params;
  if (!['uploads', 'celeb', 'vibe', 'guide'].includes(path[0]) || new URL(request.url).searchParams.has('preview')) {
    return jsonError(404, 'not_found', '요청한 경로가 없어요.');
  }
  const input = await liveMuseRequest(request, path);
  if (input instanceof Response) return input;
  return await liveMuseResponse(request.method, path, await dispatchApiRequest(input, context));
}));

export { live as GET, live as POST, live as PATCH, live as DELETE };
