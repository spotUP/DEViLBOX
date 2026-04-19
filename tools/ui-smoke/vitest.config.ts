/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'path';

// Dedicated Vitest config for the ui-smoke suite. These tests live under
// tools/ (outside the main src/ tree) and hit a real dev server, so they
// run on their own — not as part of `npm run test:ci` / `npm test`.
export default defineConfig({
  test: {
    include: ['tools/ui-smoke/*.test.ts'],
    environment: 'node',
    testTimeout: 90000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../../src'),
    },
  },
});
