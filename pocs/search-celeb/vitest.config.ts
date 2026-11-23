import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      'server-only': fileURLToPath(new URL('../../scripts/vitest/server-only-stub.ts', import.meta.url)),
    },
  },
});
