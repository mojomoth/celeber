/**
 * '/pocs/celeb-vibe-report' 경로 접근: proxy가 접두어를 떼고 같은 경로로 보낸다.
 */
import { describe, expect, it } from 'vitest';
import { pocsPathRedirect } from '../src/lib/pocs-path';
import { proxy } from '../proxy';

const loc = (r: Response | undefined) => (r ? `${r.status} ${r.headers.get('location')?.replace('http://localhost:3106', '')}` : 'pass');

describe('/pocs/celeb-vibe-report 경로', () => {
  it('접두어를 떼고 쿼리는 유지해 307', () => {
    expect(loc(pocsPathRedirect(new Request('http://localhost:3106/pocs/celeb-vibe-report')))).toBe('307 /');
    expect(loc(pocsPathRedirect(new Request('http://localhost:3106/pocs/celeb-vibe-report/')))).toBe('307 /');
    expect(loc(pocsPathRedirect(new Request('http://localhost:3106/pocs/celeb-vibe-report/new?report=pcr_1&q=a')))).toBe('307 /new?report=pcr_1&q=a');
    expect(loc(pocsPathRedirect(new Request('http://localhost:3106/pocs/celeb-vibe-report/guides/guide_1')))).toBe('307 /guides/guide_1');
  });

  it('다른 경로는 건드리지 않는다', () => {
    for (const p of ['/', '/new', '/pocs', '/pocs/celeb-vibe', '/pocs/celeb-vibe-reportx', '/api/health']) {
      expect(loc(pocsPathRedirect(new Request(`http://localhost:3106${p}`)))).toBe('pass');
    }
  });

  it('proxy: 접근 제어가 먼저, 허용되면 리다이렉트', () => {
    expect(loc(proxy(new Request('http://localhost:3106/pocs/celeb-vibe-report/guides')))).toBe('307 /guides');
    // localhost가 아닌 호스트는 토큰 없이 리다이렉트도 받지 못한다
    const blocked = proxy(new Request('http://evil.example/pocs/celeb-vibe-report', { headers: { host: 'evil.example' } }));
    expect(blocked?.status).toBe(403);
  });
});
