import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    testTimeout: 30000,
    fileParallelism: false,
    pool: 'forks',
  },
});
