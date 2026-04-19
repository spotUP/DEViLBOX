/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'path';

// Dedicated Vitest config for Furnace lock-step tests. They shell out to
// the upstream Furnace CLI and the WASM headless renderer, so they run
// locally (not in push-gated CI).
export default defineConfig({
  test: {
    include: ['tools/furnace-audit/*.test.ts'],
    environment: 'node',
    testTimeout: 120000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../../src'),
    },
  },
});
