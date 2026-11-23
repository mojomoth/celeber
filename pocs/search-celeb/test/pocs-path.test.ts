/**
 * '/pocs/search-celeb' 경로 접근: next.config의 리다이렉트가 앱 루트 경로로 보낸다.
 */
import { describe, expect, it, vi } from 'vitest';

// next.config가 루트 .env를 읽지 않게 한다 (테스트에 키를 올리지 않음)
vi.mock('@next/env', () => ({ loadEnvConfig: () => {} }));
const { default: nextConfig } = await import('../next.config');

describe('/pocs/search-celeb 경로', () => {
  it('접두어만 떼고 임시 리다이렉트, 빈 경로는 / 로 (자기 자신으로 돌아가지 않음)', async () => {
    const list = (await nextConfig.redirects?.()) ?? [];
    expect(list).toEqual([
      { source: '/pocs/search-celeb', destination: '/', permanent: false },
      { source: '/pocs/search-celeb/:path+', destination: '/:path+', permanent: false },
    ]);
  });
});
