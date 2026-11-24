import path from 'node:path';
import type { NextConfig } from 'next';

// 워크스페이스 루트 (pocs/ui/mockup 기준 세 단계 위)
const workspaceRoot = path.resolve(process.cwd(), '../../..');

const nextConfig: NextConfig = {
  turbopack: { root: workspaceRoot },
  outputFileTracingRoot: workspaceRoot,
  // Gate 1 '/pocs/<앱>' 경로 관례: 포트별 루트에서 돌므로 같은 화면으로 보낸다.
  async redirects() {
    return [
      { source: '/pocs/ui', destination: '/', permanent: false },
      { source: '/pocs/ui/:path*', destination: '/:path*', permanent: false },
    ];
  },
};

export default nextConfig;
