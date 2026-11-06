#!/usr/bin/env node
/**
 * affected-tests.mjs — resolve the small "affected-only" test set the git hooks run.
 *
 * Prints a newline-separated list of test files, chosen by FILESYSTEM PROXIMITY
 * to the changed files, and nothing wider:
 *
 *   - a changed `*.test.ts(x)` file -> itself
 *   - a changed source `dir/foo.ts(x)` -> `dir/__tests__/foo.*.test.ts(x)` and
 *     `dir/foo.*.test.ts(x)` (its sibling suites, matched by basename)
 *
 * Owner 2026-11-06 ("Siblings only, CI wide"): the hooks run only these suites,
 * at most MAX_SUITES of them. Tests that read a changed file's source or import
 * it from elsewhere, and every wider run, belong to CI (which blocks the deploy).
 * The earlier source-text and importer expansion made one push select hundreds
 * of suites and hold the machine for every other session.
 *
 * Over the cap: only the changed test files run (when they fit under the cap),
 * else nothing, and a line on stderr says the rest is left to CI.
 *
 * `--files a.ts b.ts` resolves for those paths instead of the staged set (the
 * pre-push hook and the selector's own tests). `--max-suites N` overrides the cap.
 *
 * Suites listed in tools/test-tiers/push-only.json and src/__tests__/ci/ are
 * never emitted: they are too long for a hook and run in CI.
 *
 * Exit 0 with empty output means "nothing local to run".
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, basename, join, extname } from 'node:path';

const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();

const capArg = process.argv.indexOf('--max-suites');
const MAX_SUITES = capArg >= 0 ? Number(process.argv[capArg + 1]) : 30;

const filesArg = process.argv.indexOf('--files');
const changed = filesArg >= 0
  ? process.argv.slice(filesArg + 1).filter((a, i, all) => a !== '--max-suites' && all[i - 1] !== '--max-suites')
  : execSync('git diff --cached --name-only --diff-filter=ACMR', {
    encoding: 'utf8',
    cwd: root,
  }).split('\n');

const staged = changed
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((f) => /\.(ts|tsx)$/.test(f) && (f.startsWith('src/') || f.startsWith('server/src/')));

const isTest = (f) => /\.test\.(ts|tsx)$/.test(f);

/**
 * Sibling test suites for a staged source file, matched by basename: in its
 * __tests__/ directory (the src/ layout) or next to it (the server/src layout).
 */
function importsByRelativePath(testAbs, prefix, stem) {
  const escaped = `${prefix}${stem}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`['"]${escaped}(\\.[cm]?[jt]sx?)?['"]`).test(readFileSync(testAbs, 'utf8'));
}

function siblingTests(sourceFile) {
  const ext = extname(sourceFile); // .ts | .tsx
  const stem = basename(sourceFile, ext); // foo
  const out = [];
  for (const testsDir of [join(dirname(sourceFile), '__tests__'), dirname(sourceFile)]) {
    const abs = join(root, testsDir);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs)) {
      if (!isTest(entry)) continue;
      // foo.test.ts / foo.contract.test.ts / foo.golden.test.ts …, or a suite in the same folder that imports
      // the file by relative path (server/src/ai/aiLimits.test.ts imports './limits').
      if (entry.startsWith(`${stem}.`) || importsByRelativePath(join(abs, entry), testsDir === dirname(sourceFile) ? './' : '../', stem)) {
        out.push(join(testsDir, entry));
      }
    }
  }
  return out;
}

const set = new Set();
const changedTests = new Set();
for (const f of staged) {
  if (isTest(f)) {
    set.add(f);
    changedTests.add(f);
  } else {
    // server/ suites run under server/vitest.config.ts (run_vitest_suites in snapshot.sh).
    for (const t of siblingTests(f)) set.add(t);
  }
}

// Suites too long for a hook (tools/test-tiers/push-only.json) run in CI, never here.
const pushOnlyPath = join(root, 'tools/test-tiers/push-only.json');
const pushOnly = new Set(existsSync(pushOnlyPath) ? JSON.parse(readFileSync(pushOnlyPath, 'utf8')).files.map((f) => f.file) : []);

// src/__tests__/ci/ is CI tier by directory: a bare `vitest run` excludes it (vite.config.ts) and test:ci
// names the directory. Its suites import whole engine graphs cold (regression.test.ts takes ~18 s
// for InstrumentFactory alone) and time out beside a second worker, so the hooks never run them.
const CI_DIR = 'src/__tests__/ci/';

// Only emit files that still exist on disk (a deleted test can appear staged).
const runnable = (f) => existsSync(join(root, f)) && !pushOnly.has(f) && !f.startsWith(CI_DIR);
let files = [...set].filter(runnable);
if (files.length > MAX_SUITES) {
  const own = [...changedTests].filter(runnable);
  const kept = own.length <= MAX_SUITES ? own : [];
  process.stderr.write(
    `affected-tests: ${files.length} suites is over the cap of ${MAX_SUITES}; running ${kept.length} changed test files, the rest is left to CI\n`,
  );
  files = kept;
}
process.stdout.write(files.join('\n'));
