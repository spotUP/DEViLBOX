import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `require` does not exist in the ESM browser bundle. Every call throws a
 * ReferenceError the first time it runs, and every one found in this codebase
 * sat inside a `try`/`catch` that swallowed it — which is why they survived for
 * as long as they did. The damage was invisible and wide: dub lane events never
 * fired, `Z00` did nothing, the edit cursor never followed the play head,
 * compressed Nano export threw before writing a byte, cell edits never reached
 * the StarTrekker AM / SunTronic / SunVox / PreTracker engines, entering the DJ
 * view never muted ToneEngine's master, and MIDI step recording read two fields
 * off a store that does not have them.
 *
 * A unit test cannot catch this one call at a time: vitest transforms modules
 * for Node, where `require` DOES resolve, so a test of the affected function
 * passes against the broken code. The property has to be asserted over the
 * source text instead, which is what this does.
 *
 * Test files are exempt — they run under that same Node transform, so `require`
 * works there and carries no risk.
 */

const SRC = join(process.cwd(), 'src');

/** Matches a real call — `require(` preceded by something other than an
 *  identifier character, so `no-var-requires` and prose in comments do not
 *  count. Comment lines are dropped before this ever runs. */
const CALL = /(^|[^A-Za-z0-9_$.])require\s*\(/;

function walk(dir: string, out: string[] = []): string[] {
  // withFileTypes so the whole tree costs one syscall per directory rather
  // than one per file — this runs beside nine other suites at pre-commit.
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Strips line comments, block comments and string/template literals, so only
 *  code is left to match against. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(line => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

describe('browser bundle has no CommonJS require', () => {
  it('finds no require() call in any shipped source file', () => {
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      const code = codeOnly(readFileSync(file, 'utf8'));
      code.split('\n').forEach((line, i) => {
        if (CALL.test(line)) {
          offenders.push(`${file.slice(process.cwd().length + 1)}:${i + 1}: ${line.trim()}`);
        }
      });
    }

    expect(offenders).toEqual([]);
    // Reading every source file is slow next to a unit test, and slower still
    // when the suite runs in parallel with others at pre-commit.
  }, 60_000);

  it('recognises a require call when it sees one', () => {
    // Guards the matcher itself: a sweep that silently stops matching is worse
    // than no sweep, because it reads as a pass.
    expect(CALL.test("  const { x } = require('y');")).toBe(true);
    expect(CALL.test('const m = require("y").z;')).toBe(true);
    expect(CALL.test('require(path)')).toBe(true);
    // And things that only look like one.
    expect(CALL.test('createRequire(import.meta.url)')).toBe(false);
    expect(CALL.test('this.require(x)')).toBe(false);
  });
});
