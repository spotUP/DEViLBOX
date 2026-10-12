/**
 * Owner decision 2026-10-12: the stand-alone juggle long-set suite (~6 min) is push tier. It ran in the
 * pre-commit gate whenever it was staged and held every juggle commit for minutes; it never ran at push
 * (heavy tier, nightly). Push-only suites (tools/test-tiers/push-only.json) are left out of the
 * affected-only pre-commit run and run in test:ci (VITEST_TIER=fast) at pre-push.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const root = path.resolve(__dirname, '../..');
const LONG_SET = 'src/engine/dj/__tests__/autoDJStandaloneJuggleLongSet.test.ts';

function affected(...files: string[]): string[] {
  return execFileSync('node', ['scripts/git-hooks/affected-tests.mjs', '--files', ...files], { cwd: root, encoding: 'utf8' })
    .split('\n').filter(Boolean);
}
const json = (p: string) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));

describe('push-only suites leave the pre-commit gate to the push', () => {
  it('a staged long-set suite is not run at pre-commit; a staged neighbour still is', () => {
    const neighbour = 'src/engine/dj/__tests__/autoDJFailedDoubleSetupStartsTheCooldown.test.ts';
    const picked = affected(LONG_SET, neighbour);
    expect(picked).not.toContain(LONG_SET);
    expect(picked).toContain(neighbour);
  });

  it('every push-only suite runs in test:ci at pre-push and is not in the nightly heavy tier', () => {
    const pushOnly: string[] = json('tools/test-tiers/push-only.json').files.map((f: { file: string }) => f.file);
    const heavy: string[] = json('tools/test-tiers/heavy.json').files.map((f: { file: string }) => f.file);
    const ci: string = json('package.json').scripts['test:ci'];
    expect(pushOnly).toContain(LONG_SET);
    for (const f of pushOnly) {
      expect(ci.split(' ')).toContain(f);
      expect(heavy).not.toContain(f);
    }
  });
});
