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
 *   - a staged source `foo.ts(x)` → every test that names `foo.ts(x)` in its
 *     text. Source-text tests (readFileSync of the source, then string checks)
 *     live anywhere and import nothing, so neither proximity nor the module
 *     graph finds them; a refactor of `foo.ts` broke them only at pre-push.
 *
 * `--files a.ts b.ts` resolves for those paths instead of the staged set
 * (used by the selector's own test).
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
 * Suites listed in tools/test-tiers/push-only.json are never emitted: they
 * are push-tier (test:ci at pre-push) and too long for a commit gate.
 *
 * Exit 0 with empty output means "nothing local to run" — the caller skips
 * pre-commit tests and relies on the pre-push full suite.
 */

import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, basename, join, extname } from 'node:path';

const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();

const filesArg = process.argv.indexOf('--files');
const changed = filesArg >= 0
  ? process.argv.slice(filesArg + 1)
  : execSync('git diff --cached --name-only --diff-filter=ACMR', {
    encoding: 'utf8',
    cwd: root,
  }).split('\n');

const staged = changed
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((f) => /\.(ts|tsx)$/.test(f) && (f.startsWith('src/') || f.startsWith('server/src/')));

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

/**
 * Tests that name any of these source files in their text: `foo.ts` (source-text
 * tests), or an import of the module, `/foo'` / `/foo"` - a test that imports
 * '../Foo' from another directory, or under another name than Foo.test.tsx, is
 * no sibling. 70a57efa2 changed DeckPatternDisplay.tsx; its commit and push ran
 * no test, and renderedDeckPatternViewMetersEachChannel (which imports
 * '../DeckPatternDisplay') failed only in CI. Generic module names (index,
 * types) would select half the suite and are left to CI.
 */
function sourceTextTests(sourceFiles) {
  const names = [...new Set(sourceFiles.map((f) => basename(f)))];
  if (names.length === 0) return [];
  const stems = [...new Set(names.map((n) => basename(n, extname(n))))].filter((st) => st !== 'index' && st !== 'types');
  const patterns = [
    ...names.flatMap((n) => ['-e', n]),
    ...stems.flatMap((st) => ['-e', `/${st}'`, '-e', `/${st}"`]),
  ];
  try {
    return execFileSync(
      'git',
      ['grep', '-l', '-F', ...patterns, '--', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
      { encoding: 'utf8', cwd: root },
    ).split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return []; // git grep exits 1 when nothing matches
  }
}

const set = new Set();
const sources = [];
for (const f of staged) {
  if (isTest(f)) {
    if (existsSync(join(root, f))) set.add(f);
  } else {
    sources.push(f);
    // server/ suites are not in the vitest CI glob; only src/ tests read server code.
    if (f.startsWith('src/')) for (const t of siblingTests(f)) set.add(t);
  }
}
for (const t of sourceTextTests(sources)) set.add(t);

// Push-tier suites too long for this gate (tools/test-tiers/push-only.json) run at pre-push, never here.
const pushOnlyPath = join(root, 'tools/test-tiers/push-only.json');
const pushOnly = new Set(existsSync(pushOnlyPath) ? JSON.parse(readFileSync(pushOnlyPath, 'utf8')).files.map((f) => f.file) : []);

// Only emit files that still exist on disk (a deleted test can appear staged).
const files = [...set].filter((f) => existsSync(join(root, f)) && !pushOnly.has(f));
process.stdout.write(files.join('\n'));
