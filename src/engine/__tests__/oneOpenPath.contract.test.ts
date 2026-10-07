/**
 * U4.0 ratchet: no NEW caller of the song-open / export entry points may
 * appear outside the allowlist, and an entry may not stay once its calls are
 * gone. Counted from the TypeScript AST of every non-test file under src/
 * (call expressions, import aliases resolved) - see oneOpenPathScan.ts.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanTree, scanSource, RESTRICTED, type CallMap } from './oneOpenPathScan';
import { ALLOWED_CALLERS } from './oneOpenPathAllowlist';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export function diffAgainstAllowlist(actual: CallMap): { added: string[]; stale: string[] } {
  const allowed: CallMap = {};
  for (const a of ALLOWED_CALLERS) allowed[`${a.file}|${a.fn}|${a.callee}`] = a.count;
  const added: string[] = [];
  const stale: string[] = [];
  for (const [k, n] of Object.entries(actual)) {
    const a = allowed[k] ?? 0;
    if (n > a) added.push(`${k}: ${n} call(s), allowed ${a}`);
  }
  for (const [k, a] of Object.entries(allowed)) {
    const n = actual[k] ?? 0;
    if (n < a) stale.push(`${k}: ${n} call(s), allowlist says ${a} - lower or remove the entry`);
  }
  return { added, stale };
}

let scanned: CallMap | null = null;
function scanOnce(): CallMap {
  scanned ??= scanTree(path.join(repoRoot, 'src'), repoRoot);
  return scanned;
}

const SCAN_TIMEOUT = 60_000;

describe('one open path guard (ratchet)', () => {
  it('allowlist has no duplicate keys and every entry names its removing phase', () => {
    const keys = ALLOWED_CALLERS.map((a) => `${a.file}|${a.fn}|${a.callee}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const a of ALLOWED_CALLERS) {
      expect(a.removedBy).toMatch(/^U\d/);
      expect(RESTRICTED).toContain(a.callee);
    }
  });

  it('no restricted function gains a caller, and the allowlist has no stale entries', () => {
    const { added, stale } = diffAgainstAllowlist(scanOnce());
    expect({ added, stale }).toEqual({ added: [], stale: [] });
  }, SCAN_TIMEOUT);

  it('scanner sees property calls, aliased imports and ignores comments/strings/definitions', () => {
    const src = [
      "import { parseModuleToSong as p } from './x';",
      "// applySong(1)",
      "const s = 'applySong(1)';",
      'export function applySong() {}',
      'function f() { p(1); engine.addCompanionFile(1, 2); }',
    ].join('\n');
    expect(scanSource(src, 'a.ts')).toEqual({
      'a.ts|f|parseModuleToSong': 1,
      'a.ts|f|addCompanionFile': 1,
    });
  });

  it('a planted caller is reported as added', () => {
    const actual = { ...scanOnce() };
    actual['src/planted/Fake.ts|fake|parseModuleToSong'] = 1;
    expect(diffAgainstAllowlist(actual).added).toHaveLength(1);
  }, SCAN_TIMEOUT);
});
