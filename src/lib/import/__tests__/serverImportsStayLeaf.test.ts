/**
 * The API server (server/, built into dist/ and deployed alone) reaches into
 * the frontend tree for a few shared helpers. Those must stay leaf modules: a
 * single import of the app graph (FormatRegistry -> UADEParser -> the engine,
 * stores, test fixtures ...) made `server npm run build` fail with ~800 errors
 * and left the live API un-deployable.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';

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
    const allmods = readFileSync(join(serverSrc, 'services/modlandAllmods.ts'), 'utf8');
    expect(allmods).not.toMatch(/FormatRegistry/);
    expect(allmods).toMatch(/formatFilenameMatcher/);
  });
});

/** Root src/ files that import from server/src (the frontend type-check and vitest pull these in). */
function rootFilesImportingServer(): string[] {
  const out: string[] = [];
  const scan = (dir: string): void => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) {
        if (n !== 'node_modules') scan(p);
      } else if (/\.tsx?$/.test(n)) {
        for (const s of specifiers(p)) {
          if (!s.startsWith('.')) continue;
          const r = resolveRelative(p, s);
          if (r && r.startsWith(serverSrc + '/')) {
            out.push(p);
            break;
          }
        }
      }
    }
  };
  scan(appSrc);
  return out;
}

function packageName(spec: string): string {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

describe('server modules imported by root src/ need no server-only package', () => {
  // The electron CI job runs only the root npm ci: a server module that imports
  // adm-zip (declared in server/package.json only) breaks the root type-check.
  it('every bare import reachable from root src/ through server/src is a root dependency', () => {
    const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
    const builtins = new Set(builtinModules);
    const seen = new Set<string>();
    const queue: string[] = [];
    const entryFiles = rootFilesImportingServer();
    expect(entryFiles.length).toBeGreaterThanOrEqual(5);
    for (const f of entryFiles) {
      for (const s of specifiers(f)) {
        const r = s.startsWith('.') ? resolveRelative(f, s) : null;
        if (r && r.startsWith(serverSrc + '/')) queue.push(r);
      }
    }
    const offenders: string[] = [];
    while (queue.length) {
      const f = queue.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      for (const s of specifiers(f)) {
        if (s.startsWith('.')) {
          const r = resolveRelative(f, s);
          if (r) queue.push(r);
          continue;
        }
        const name = s.replace(/^node:/, '');
        if (s.startsWith('node:') || builtins.has(packageName(name)) || builtins.has(name)) continue;
        // The root type-check only needs declarations: @types/<name> in the root is enough
        // (better-sqlite3 is imported at runtime solely by a test that runs with server/node_modules).
        const pkgName = packageName(s);
        const typesName = `@types/${pkgName.replace(/^@/, '').replace('/', '__')}`;
        if (!declared.has(pkgName) && !declared.has(typesName)) offenders.push(`${relative(repo, f)} imports '${s}'`);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});

describe('Dockerfile.backend copies every frontend file the server reaches', () => {
  // The backend image builds with only the server tree plus the COPY'd frontend paths.
  it('each reached frontend file lies under a COPY source', () => {
    const docker = readFileSync(join(repo, 'Dockerfile.backend'), 'utf8');
    const copied: string[] = [];
    for (const line of docker.split('\n')) {
      const m = /^COPY\s+(?:--\S+\s+)*(src\/\S+)\s+\S+\s*$/.exec(line.trim());
      if (m) copied.push(m[1].replace(/\/$/, ''));
    }
    expect(copied.length).toBeGreaterThan(0);
    const { files } = appFilesReachedByServer();
    const missing = [...files]
      .map((f) => relative(repo, f))
      .filter((f) => !copied.some((c) => f === c || f.startsWith(`${c}/`) || f === `${c}.ts`));
    expect(missing).toEqual([]);
  });
});
