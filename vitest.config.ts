import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Workers-runtime module; tests replace it with a plain class.
      'cloudflare:email': fileURLToPath(new URL('./worker/test/cloudflare-email.mock.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'worker/test/**/*.test.ts'],
  },
});
