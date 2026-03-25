import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/unit/**/*.test.ts',
      'tests/chatwoot/normalizer.test.ts',
      'tests/handoff/**/*.test.ts',
    ],
    exclude: [
      'tests/telegram-ingestion/**',
      'tests/security/**',
      'tests/memory/**',
      'tests/knowledge/**',
      'tests/intent/**',
    ],
    setupFiles: [path.resolve(__dirname, 'tests/setup/test-setup.ts')],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 65,
        functions: 65,
        branches: 55,
      },
    },
  },
});
