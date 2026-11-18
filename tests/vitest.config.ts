// Vitest config for the QA suite (tests/ai, tests/ops, tests/content, tests/qa *.test.ts). The root vitest.config.ts
// (npm test) stays untouched and keeps running src/** and worker/test/**.
// tests/personas/** is owned by the live-user-testing agent and is deliberately excluded.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  root,
  resolve: {
    alias: {
      'cloudflare:email': fileURLToPath(new URL('../worker/test/cloudflare-email.mock.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/ai/**/*.test.ts', 'tests/ops/**/*.test.ts', 'tests/content/**/*.test.ts', 'tests/qa/**/*.test.ts'],
    exclude: ['tests/personas/**', 'node_modules/**', '.build*/**'],
    testTimeout: 30_000,
    // QA_JUNIT names the JUnit file per suite (CI sets it per step so reports don't overwrite each other).
    reporters: ['default', ['junit', { outputFile: process.env.QA_JUNIT || 'test-results/vitest-junit.xml' }]],
  },
});
