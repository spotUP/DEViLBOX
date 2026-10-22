// vite.config.ts excluded src/__tests__/ci/** from every run, and vitest
// applies exclude after the CLI filters, so test:ci (which names that
// directory) found no files there and passed without running any of them.
// This guard lives outside that directory on purpose: a guard inside it would
// be skipped by the same bug it checks for.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(__dirname, '../..');

function listedFiles(args: string[]): string[] {
  const out = execFileSync('npx', ['vitest', 'list', '--config', 'vite.config.ts', '--filesOnly', ...args], {
    cwd: root,
    env: { ...process.env, VITEST_TIER: 'fast' },
  }).toString();
  return out.split('\n').map((line) => line.trim()).filter((line) => line.endsWith('.test.ts'));
}

describe('test:ci runs src/__tests__/ci', () => {
  it('lists the ci directory files when a command names the directory', () => {
    const files = listedFiles(['src/__tests__/ci/']);
    expect(files.some((f) => f.includes('src/__tests__/ci/regression.test.ts'))).toBe(true);
  }, 120_000);
});
