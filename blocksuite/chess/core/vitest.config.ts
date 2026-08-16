import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    target: 'es2018',
  },
  test: {
    include: ['src/__tests__/**/*.unit.spec.ts'],
    // Perft walks millions of nodes; the default 500ms used elsewhere is far too tight.
    testTimeout: 120_000,
    coverage: {
      provider: 'istanbul',
      reporter: ['lcov'],
      reportsDirectory: '../../../.coverage/chess-core',
    },
  },
});
