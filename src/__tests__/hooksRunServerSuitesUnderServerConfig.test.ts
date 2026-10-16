/**
 * The commit and push gates run server/ suites under server/vitest.config.ts.
 *
 * Both hooks handed every selected suite to one vitest run with the root
 * vite.config.ts, whose include is src/** only. A commit of server files alone
 * (the Anthropic and OpenAI adapters) aborted on "No test files found"; a mixed
 * commit, and every push (--passWithNoTests), skipped the server suites without
 * a word, so no gate ran them.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

const root = path.resolve(__dirname, '../..');

function cleanEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
}

/** Runs run_vitest_suites against a fake snapshot whose vitest prints its cwd and arguments. */
function runSuites(args: string): string[] {
  const snap = fs.mkdtempSync(path.join(os.tmpdir(), 'suites-snap-'));
  try {
    fs.mkdirSync(path.join(snap, 'node_modules/.bin'), { recursive: true });
    fs.mkdirSync(path.join(snap, 'server'));
    const bin = path.join(snap, 'node_modules/.bin/vitest');
    fs.writeFileSync(bin, '#!/bin/sh\necho "$(basename "$PWD")|$*"\n');
    fs.chmodSync(bin, 0o755);
    const script = `set -euo pipefail; . ${path.join(root, 'scripts/git-hooks/snapshot.sh')}; SNAP=${snap}; run_vitest_suites ${args}`;
    return execFileSync('bash', ['-c', script], { encoding: 'utf8', env: cleanEnv() })
      .split('\n').filter(Boolean).map((l) => l.replace(path.basename(snap), 'SNAP'));
  } finally {
    fs.rmSync(snap, { recursive: true, force: true });
  }
}

describe('hooks run each suite under the config that includes it', () => {
  it('a server suite runs from server/ under its own config, a src suite under the root config', () => {
    expect(runSuites('-- src/a.test.ts server/src/ai/vendors.test.ts')).toEqual([
      'SNAP|run --config vite.config.ts src/a.test.ts',
      'server|run --config vitest.config.ts src/ai/vendors.test.ts',
    ]);
  });

  it('a commit of server suites alone never asks the root config for them', () => {
    expect(runSuites('-- server/src/ai/limits.test.ts')).toEqual([
      'server|run --config vitest.config.ts src/ai/limits.test.ts',
    ]);
  });

  it('flags reach both runs', () => {
    expect(runSuites('--passWithNoTests -- src/a.test.ts server/src/b.test.ts')).toEqual([
      'SNAP|run --config vite.config.ts --passWithNoTests src/a.test.ts',
      'server|run --config vitest.config.ts --passWithNoTests src/b.test.ts',
    ]);
  });

  it('both hooks run their selected suites through run_vitest_suites', () => {
    for (const hook of ['pre-commit', 'pre-push']) {
      const text = fs.readFileSync(path.join(root, 'scripts/git-hooks', hook), 'utf8');
      expect(text).toContain('run_vitest_suites');
      expect(text).not.toMatch(/vitest run --config vite\.config\.ts/);
    }
  });

  it('a change to a server source selects the server suite next to it', () => {
    const out = execFileSync('node', ['scripts/git-hooks/affected-tests.mjs', '--files', 'server/src/ai/limits.ts'], {
      cwd: root, encoding: 'utf8', env: cleanEnv(),
    });
    expect(out.split('\n')).toContain('server/src/ai/aiLimits.test.ts');
  });
});
