/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

// Dedicated Vitest config for the Sonix C-port lock-step audit. It shells out
// to a C compiler to build the native harness (render-native.c) and renders a
// committed fixture, so it runs locally (not in push-gated CI), mirroring the
// furnace-audit pattern. Run with: npm run test:sonix
export default defineConfig({
  test: {
    include: ['tools/sonix-audit/*.test.ts'],
    environment: 'node',
    testTimeout: 120000,
    hookTimeout: 60000,
  },
});
