import { defineConfig } from 'vitest/config';
import { testCpuLimits } from '../vitest.limits';

export default defineConfig({
  test: { ...testCpuLimits(), include: ['src/**/*.test.ts'], environment: 'node' },
});
