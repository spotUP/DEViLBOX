#!/usr/bin/env node
/**
 * affected-tests.mjs — resolve the fast, "affected-only" test set for a commit.
 *
 * Prints a newline-separated list of test files to run, chosen by FILESYSTEM
 * PROXIMITY to the staged changes:
 *
 *   - a staged `*.test.ts(x)` file → itself
 *   - a staged source `dir/foo.ts(x)` → `dir/__tests__/foo*.test.ts(x)`
 *     (its sibling test suite, matched by basename)
 *
 * Why proximity and not `vitest related` (module-graph)? Measured: this repo's
 * store/type barrels make the import graph hyper-connected, so `vitest related`
 * on a single leaf pulls in hundreds of unrelated suites (~2.5 min) — no faster
 * than the full run, and the "related" set is polluted by incidental barrel
 * imports. A file's sibling `__tests__` suite is the true, fast relevance
 * signal for a pre-commit gate. Anything proximity misses (a far-away test that
 * genuinely depends on a shared change) is caught by the FULL suite at
 * pre-push + CI — this is only the tight-loop commit gate.
 *
 * Exit 0 with empty output means "nothing local to run" — the caller skips
 * pre-commit tests and relies on the pre-push full suite.
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, basename, join, extname } from 'node:path';

const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();

const staged = execSync('git diff --cached --name-only --diff-filter=ACMR', {
  encoding: 'utf8',
  cwd: root,
})
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((f) => /\.(ts|tsx)$/.test(f) && f.startsWith('src/'));

const isTest = (f) => /\.test\.(ts|tsx)$/.test(f);

/** Sibling test suites for a staged source file, matched by basename. */
function siblingTests(sourceFile) {
  const ext = extname(sourceFile); // .ts | .tsx
  const stem = basename(sourceFile, ext); // foo
  const testsDir = join(dirname(sourceFile), '__tests__');
  const abs = join(root, testsDir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const entry of readdirSync(abs)) {
    // foo.test.ts / foo.contract.test.ts / foo.golden.test.ts …
    if (isTest(entry) && (entry === `${stem}.test.ts` || entry === `${stem}.test.tsx` || entry.startsWith(`${stem}.`))) {
      if (isTest(entry)) out.push(join(testsDir, entry));
    }
  }
  return out;
}

const set = new Set();
for (const f of staged) {
  if (isTest(f)) {
    if (existsSync(join(root, f))) set.add(f);
  } else {
    for (const t of siblingTests(f)) set.add(t);
  }
}

// Only emit files that still exist on disk (a deleted test can appear staged).
const files = [...set].filter((f) => existsSync(join(root, f)));
process.stdout.write(files.join('\n'));
