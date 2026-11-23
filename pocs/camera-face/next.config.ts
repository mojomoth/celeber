import fs from 'node:fs';
import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// 워크스페이스 루트(pnpm-workspace.yaml 위치)를 찾아 루트 .env를 로드한다.
function findWorkspaceRoot(start: string): string {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = path.dirname(dir);
  }
  return path.resolve(start, '../..');
}

const workspaceRoot = findWorkspaceRoot(process.cwd());
// forceReload=true: Next가 앱 폴더 기준으로 먼저 로드한 캐시를 무시하고 루트 .env를 적용
loadEnvConfig(workspaceRoot, process.env.NODE_ENV !== 'production', { info: () => {}, error: console.error }, true);
// 데이터 디렉터리를 절대경로로 고정 (앱 cwd 기준 ../.data = pocs/.data)
process.env.CELEBER_DATA_DIR ||= path.join(workspaceRoot, 'pocs', '.data');

const nextConfig: NextConfig = {
  // 워크스페이스 TS 소스 패키지(선행 PoC 포함)는 앱에서 직접 트랜스파일한다.
  transpilePackages: ["@celeber/core","@celeber/ui"],
  // 네이티브 바이너리는 번들하지 않는다. node:sqlite는 Node 내장이라 자동 external.
  serverExternalPackages: ['sharp'],
  turbopack: { root: workspaceRoot },
  outputFileTracingRoot: workspaceRoot,
  images: { unoptimized: true },
  // Gate 1 '/pocs/<앱>' 경로 접근: 앱은 포트별 루트에서 돌므로 같은 화면으로 보낸다(basePath를 쓰면 /api 경로가 바뀐다).
  async redirects() {
    return [
      { source: '/pocs/camera-face', destination: '/', permanent: false },
      { source: '/pocs/camera-face/:path*', destination: '/:path*', permanent: false },
    ];
  },
  experimental: {
    serverActions: { bodySizeLimit: '25mb' },
  },
};

export default nextConfig;
