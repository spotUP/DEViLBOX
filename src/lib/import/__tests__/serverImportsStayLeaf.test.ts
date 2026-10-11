/**
 * The API server (server/, built into dist/ and deployed alone) reaches into
 * the frontend tree for a few shared helpers. Those must stay leaf modules: a
 * single import of the app graph (FormatRegistry -> UADEParser -> the engine,
 * stores, test fixtures ...) made `server npm run build` fail with ~800 errors
 * and left the live API un-deployable.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const repo = resolve(__dirname, '../../../..');
const serverSrc = join(repo, 'server/src');
const appSrc = join(repo, 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : walk(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

/** Every module specifier a file names: import/export-from, dynamic import, require. */
function specifiers(file: string): string[] {
  const text = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const out: string[] = [];
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;
  for (let m = re.exec(text); m; m = re.exec(text)) out.push(m[1]);
  return out;
}

function resolveRelative(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const c of [base, `${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

/** Frontend files the server pulls in, with the transitive relative closure. */
function appFilesReachedByServer(): { files: Set<string>; entries: Map<string, string> } {
  const entries = new Map<string, string>();
  for (const f of walk(serverSrc)) {
    for (const s of specifiers(f)) {
      if (!s.startsWith('.')) continue;
      const r = resolveRelative(f, s);
      if (r && r.startsWith(appSrc + '/')) entries.set(r, f);
    }
  }
  const files = new Set<string>();
  const queue = [...entries.keys()];
  while (queue.length) {
    const f = queue.pop()!;
    if (files.has(f)) continue;
    files.add(f);
    for (const s of specifiers(f)) {
      if (!s.startsWith('.')) continue;
      const r = resolveRelative(f, s);
      if (r) queue.push(r);
    }
  }
  return { files, entries };
}

describe('server imports of the frontend tree stay leaf modules', () => {
  const { files, entries } = appFilesReachedByServer();

  it('the server does reach shared frontend helpers (the scan is not vacuous)', () => {
    expect(entries.size).toBeGreaterThanOrEqual(3);
  });

  it('no module the server reaches imports an alias, a package or the app graph', () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const s of specifiers(f)) {
        if (!s.startsWith('.')) offenders.push(`${f.slice(repo.length + 1)} imports '${s}'`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the server never imports FormatRegistry (modland filter uses the filename matcher)', () => {
    const importers = [...entries.keys()].filter((f) => /FormatRegistry|UADEParser/.test(f));
    expect(importers).toEqual([]);
    const indexer = readFileSync(join(serverSrc, 'services/modlandIndexer.ts'), 'utf8');
    expect(indexer).not.toMatch(/FormatRegistry/);
    expect(indexer).toMatch(/formatFilenameMatcher/);
  });
});
