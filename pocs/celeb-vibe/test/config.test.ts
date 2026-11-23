import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BODY_BYTES } from '@celeber/core/server/uploads';

describe('next.config 업로드 본문 상한', () => {
  it('proxy 본문 상한이 업로드 핸들러 상한(25MB 파일 + multipart 여유)보다 크다', async () => {
    const { default: config, PROXY_BODY_LIMIT_BYTES } = await import('../next.config');
    expect(config.experimental?.proxyClientMaxBodySize).toBe(PROXY_BODY_LIMIT_BYTES);
    expect(PROXY_BODY_LIMIT_BYTES).toBeGreaterThanOrEqual(MAX_UPLOAD_BODY_BYTES);
  });
});

describe('next.config /pocs/celeb-vibe 경로', () => {
  it('루트와 하위 경로를 둘로 나눠 앱 경로로 보낸다 (빈 경로 무한 리다이렉트 방지)', async () => {
    const { default: config } = await import('../next.config');
    const redirects = await config.redirects!();
    expect(redirects).toEqual([
      { source: '/pocs/celeb-vibe', destination: '/', permanent: false },
      { source: '/pocs/celeb-vibe/:path+', destination: '/:path+', permanent: false },
    ]);
  });
});
