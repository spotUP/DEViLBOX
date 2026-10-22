// Vitest used to pin every core and leave the desktop unresponsive: configs
// without a worker cap fell back to one worker per core, and capped ones still
// ran at full priority. Every vitest config takes vitest.limits.ts, which caps
// the workers and lowers the vitest process priority (workers inherit it).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(__dirname, '../../..');

function vitestConfigs(): string[] {
  return execFileSync('git', ['ls-files', 'vite.config.ts', '*vitest.config.*'], { cwd: root })
    .toString().split('\n').filter((f) => f && !f.startsWith('Reference Code/'));
}

describe('every vitest config runs at low CPU priority', () => {
  it('finds the configs', () => {
    expect(vitestConfigs()).toContain('vite.config.ts');
  });

  it.each(vitestConfigs())('%s takes the shared worker cap', (file) => {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    expect(src).toMatch(/\.\.\.testCpuLimits\(\)/);
  });

  it('this test worker inherited the lowered priority', () => {
    expect(os.getPriority(0)).toBeGreaterThanOrEqual(19);
  });
});
