import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));
loadEnvConfig(workspaceRoot, process.env.NODE_ENV !== 'production', { info: () => {}, error: console.error }, true);
process.env.CELEBER_DATA_DIR ||= path.join(workspaceRoot, 'pocs', '.data');

const config: NextConfig = {
  turbopack: { root: workspaceRoot },
  outputFileTracingRoot: workspaceRoot,
  transpilePackages: [
    '@celeber/core', '@celeber/ui', '@celeber/camera-face', '@celeber/camera-body',
    '@celeber/search-celeb', '@celeber/celeb-vibe', '@celeber/personal-color-report', '@celeber/celeb-vibe-report',
  ],
  serverExternalPackages: ['sharp'],
  images: { unoptimized: true, localPatterns: [{ pathname: '/photos/**' }, { pathname: '/bi/**' }] },
  experimental: { proxyClientMaxBodySize: '36mb' },
};

export default config;
