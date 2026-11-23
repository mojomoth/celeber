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
  // /pocs/search-celeb 경로로 들어와도 앱 루트로 보낸다(쿼리 유지). API는 루트 경로 그대로 쓴다.
  // `:path*` 하나로 쓰면 빈 경로가 Location '?q=..'(자기 자신)으로 바뀌어 무한 리다이렉트가 된다. 그래서 둘로 나눈다.
  redirects: async () => [
    { source: '/pocs/search-celeb', destination: '/', permanent: false },
    { source: '/pocs/search-celeb/:path+', destination: '/:path+', permanent: false },
  ],
  experimental: {
    serverActions: { bodySizeLimit: '25mb' },
    // proxy.ts가 있으면 Next가 요청 본문을 이 크기까지만 버퍼링한다(기본 10MB → 10MB 넘는 사진의 FormData 파싱 실패).
    // core MAX_UPLOAD_BODY_BYTES(36MB)와 같게 둔다. 그보다 큰 본문은 업로드 라우트가 413으로 거절한다.
    proxyClientMaxBodySize: '36mb',
  },
};

export default nextConfig;
