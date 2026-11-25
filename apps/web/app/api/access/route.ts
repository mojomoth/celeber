import { ACCESS_HEADER, decideAccess } from '@celeber/core/server/access';
import { createSessionCookie } from '../../../src/access';

export const runtime = 'nodejs';

function redirect(location: string, cookie?: string) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  if (cookie) headers.set('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers });
}

export async function POST(request: Request) {
  const length = Number(request.headers.get('content-length'));
  if (!Number.isInteger(length) || length < 1 || length > 1024 || !request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
    return redirect('/access?failed=1');
  }

  const code = new URLSearchParams(await request.text()).get('code')?.trim();
  if (!code || !/^[\x21-\x7e]{1,192}$/.test(code)) return redirect('/access?failed=1');
  const headers = new Headers(request.headers);
  headers.set(ACCESS_HEADER, code);
  const access = decideAccess({ method: 'POST', url: request.url, headers }, {
    token: process.env.CELEBER_ACCESS_TOKEN,
    requireToken: true,
    allowQueryToken: false,
  });
  if (!access.ok) return redirect('/access?failed=1');

  return redirect('/', createSessionCookie(code));
}
