import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Suites sign in many times from one address; rate limiting has its own test.
    env: { AUTH_RATE_LIMIT: '100000' },
  },
});
