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
  transpilePackages: ["@celeber/core","@celeber/ui","@celeber/camera-face","@celeber/camera-body"],
  // 네이티브 바이너리는 번들하지 않는다. node:sqlite는 Node 내장이라 자동 external.
  serverExternalPackages: ['sharp'],
  turbopack: { root: workspaceRoot },
  outputFileTracingRoot: workspaceRoot,
  images: { unoptimized: true },
  // Gate 1 `/pocs/...` 경로 접근: 앱은 루트(/)에서 동작하므로 /pocs/personal-color-report/* 를 같은 경로로 보낸다.
  // basePath는 선행 플로우(camera-face/body)의 절대 경로 fetch('/api/...')를 깨므로 쓰지 않는다.
  async redirects() {
    // '/:path*' 하나로 두면 빈 경로에서 Location이 비어 버린다(16.4.6 실측). 루트는 따로 둔다.
    return [
      { source: '/pocs/personal-color-report', destination: '/', permanent: false },
      { source: '/pocs/personal-color-report/:path+', destination: '/:path+', permanent: false },
    ];
  },
  experimental: {
    serverActions: { bodySizeLimit: '25mb' },
    // proxy.ts가 있으면 Next가 요청 본문을 기본 10MB까지만 버퍼링한다. 그러면 10~25MB 사진이 잘려
    // /api/uploads가 FormData를 못 읽는다. 업로드 본문 상한(core MAX_UPLOAD_BODY_BYTES, 약 36MB)보다 크게 둔다.
    proxyClientMaxBodySize: '40mb',
  },
};

export default nextConfig;
