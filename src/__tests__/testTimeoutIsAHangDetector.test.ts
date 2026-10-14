/**
 * The pre-push gate runs every test on two workers of a machine other agents
 * share. Vitest's 5 s default timeout failed working tests there: a first
 * import that lazy-loads a route or a registry (Hippel ST import route,
 * mameChipWiring - 179 s for its file under load, 2.5 s idle) crossed it and
 * blocked the 2026-10-08 and 2026-10-10 pushes. The timeout catches hangs; a
 * test that asserts speed says so itself.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('the test timeout', () => {
  it('is long enough that a loaded machine does not fail a working test', () => {
    const config = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');
    const m = /testTimeout:\s*([\d_]+)/.exec(config);
    expect(m, 'vite.config.ts sets no testTimeout: vitest falls back to 5 s').not.toBeNull();
    expect(Number(m![1].replace(/_/g, ''))).toBeGreaterThanOrEqual(30_000);
  });

  it('gives setup and teardown hooks the same room (Vitest hook default is 10 s)', () => {
    const config = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');
    const m = /hookTimeout:\s*([\d_]+)/.exec(config);
    expect(m, 'vite.config.ts sets no hookTimeout: a beforeAll that scans src/engine fails at 10 s under load').not.toBeNull();
    expect(Number(m![1].replace(/_/g, ''))).toBeGreaterThanOrEqual(30_000);
  });
});
