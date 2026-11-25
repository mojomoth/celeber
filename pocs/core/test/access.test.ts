import { describe, expect, it } from 'vitest';
import { ACCESS_COOKIE, decideAccess } from '../src/server/access';

const privateAccess = { token: 'test-access-code', requireToken: true, allowQueryToken: false };

function request(path: string, headers: HeadersInit = {}, method = 'GET') {
  return { url: `https://celeber.example${path}`, headers: new Headers(headers), method };
}

describe('통합 앱 원격 접근', () => {
  it('운영 모드에서는 로컬 Host와 주소의 코드로 접근할 수 없다', () => {
    expect(decideAccess(request('/', { host: 'localhost' }), privateAccess)).toMatchObject({ ok: false });
    expect(decideAccess(request('/?access=test-access-code'), privateAccess)).toMatchObject({ ok: false });
  });

  it('정상 쿠키를 허용하며 망가진 쿠키와 다른 사이트 변경 요청을 거부한다', () => {
    const cookie = `${ACCESS_COOKIE}=test-access-code`;
    expect(decideAccess(request('/', { cookie }), privateAccess)).toEqual({ ok: true });
    expect(decideAccess(request('/', { cookie: `${ACCESS_COOKIE}=%` }), privateAccess)).toMatchObject({ ok: false });
    expect(decideAccess(request('/api/guide/my-data', { cookie, origin: 'https://other.example' }, 'DELETE'), privateAccess)).toMatchObject({ ok: false, code: 'cross_site_request' });
  });
});
