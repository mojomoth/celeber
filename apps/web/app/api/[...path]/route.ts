import * as body from '@celeber/camera-body/routes';
import * as face from '@celeber/camera-face/routes';
import * as vibe from '@celeber/celeb-vibe/routes';
import * as guide from '@celeber/celeb-vibe-report/routes';
import { getCapabilities } from '@celeber/core/server/env';
import { jsonError } from '@celeber/core/server/http';
import { publicImageGET } from '@celeber/core/server/public-image';
import { handleUploadPost, serveUpload } from '@celeber/core/server/uploads';
import * as report from '@celeber/personal-color-report/routes';
import * as celeb from '@celeber/search-celeb/routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteHandler = (request: Request, context: { params: Promise<{ id: string }> }) => Response | Promise<Response>;
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

// 통합 앱에서 쓰는 PoC API를 같은 출처에서 제공한다.
const endpoints: Record<string, Partial<Record<Method, RouteHandler>>> = {
  'meta': { GET: () => Response.json(getCapabilities()) },
  'uploads': { POST: (req) => handleUploadPost(req) },
  'uploads/:id': { GET: async (req, { params }) => serveUpload((await params).id, req) },
  'public-image/:id': { GET: async (req, { params }) => publicImageGET(req, (await params).id) },
  'face/environment': { POST: face.environmentPOST },
  'face/analyze': { POST: face.analyzePOST },
  'face/sessions/:id': { GET: face.sessionGET },
  'face/latest': { GET: face.latestGET },
  'body/analyze': { POST: body.analyzePOST },
  'body/sessions/:id': { GET: body.sessionGET },
  'report/generate': { POST: report.generatePOST },
  'report/inputs': { GET: report.inputsGET },
  'report/reports/:id': { GET: report.reportGET, PATCH: report.reportPATCH },
  'report/latest': { GET: report.latestGET },
  'celeb/suggest': { GET: celeb.suggestGET },
  'celeb/search': { GET: celeb.searchGET },
  'celeb/identify': { POST: celeb.identifyPOST },
  'celeb/celebs': { GET: celeb.celebsGET, POST: celeb.celebsPOST },
  'celeb/celebs/:id': { GET: celeb.celebGET, PATCH: celeb.celebPATCH, DELETE: celeb.celebDELETE },
  'celeb/celebs/:id/images': { GET: celeb.celebImagesGET, POST: celeb.celebImagesPOST },
  'celeb/images/:id': { PATCH: celeb.imagePATCH },
  'vibe/precheck': { POST: vibe.precheckPOST },
  'vibe/analyze': { POST: vibe.analyzePOST },
  'vibe/import-url': { POST: vibe.importUrlPOST },
  'vibe/analyses': { GET: vibe.analysesGET },
  'vibe/analyses/:id': { GET: vibe.analysisGET, PATCH: vibe.analysisPATCH },
  'guide/generate': { POST: guide.generatePOST },
  'guide/guides': { GET: guide.guidesGET },
  'guide/guides/:id': { GET: guide.guideGET, PATCH: guide.guidePATCH, DELETE: guide.guideDELETE },
  'guide/reports': { GET: guide.myReportsGET },
  'guide/my-data': { GET: guide.myDataGET, DELETE: guide.myDataDELETE },
};

const patterns = Object.entries(endpoints).map(([pattern, handlers]) => ({ segments: pattern.split('/'), handlers }));

async function dispatch(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const route = patterns.find(({ segments }) => segments.length === path.length && segments.every((part, index) => part === ':id' || part === path[index]));
  if (!route) return jsonError(404, 'not_found', '요청한 경로가 없습니다.');

  const method = request.method === 'HEAD' ? 'GET' : request.method;
  const handler = route.handlers[method as Method];
  const allow = [...Object.keys(route.handlers), ...(route.handlers.GET ? ['HEAD'] : []), 'OPTIONS'].join(', ');
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: { Allow: allow } });
  if (!handler) {
    const response = jsonError(405, 'method_not_allowed', '이 경로에서 사용할 수 없는 요청입니다.');
    response.headers.set('Allow', allow);
    return response;
  }

  const id = path[route.segments.indexOf(':id')] ?? '';
  const response = await handler(request, { params: Promise.resolve({ id }) });
  response.headers.set('Cache-Control', 'private, no-store');
  return request.method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response;
}

export { dispatch as GET, dispatch as HEAD, dispatch as POST, dispatch as PATCH, dispatch as DELETE, dispatch as OPTIONS };
