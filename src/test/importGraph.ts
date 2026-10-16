/**
 * Static import graph of the app sources, for tests that pin which modules a
 * file may reach.
 *
 * Counted from the TypeScript AST of the real sources: static `import` /
 * `export ... from` edges that survive compilation (type-only imports are
 * erased and skipped; dynamic import() is a call-time edge and is not
 * followed). Path aliases mirror vite.config.ts. Package imports are outside
 * the app graph and are not followed.
 */
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(__dirname, '../..');
const ALIASES: Array<[string, string]> = [
  ['@components', 'src/components'], ['@hooks', 'src/hooks'], ['@stores', 'src/stores'],
  ['@engine', 'src/engine'], ['@typedefs', 'src/types'], ['@utils', 'src/utils'],
  ['@constants', 'src/constants'], ['@lib', 'src/lib'], ['@generated', 'src/generated'],
  ['@contexts', 'src/contexts'], ['@', 'src'],
];

function resolveSpecifier(spec: string, fromFile: string): string | null {
  let base: string | null = null;
  if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else {
    for (const [alias, dir] of ALIASES) {
      if (spec === alias || spec.startsWith(alias + '/')) { base = path.join(ROOT, dir, spec.slice(alias.length)); break; }
    }
  }
  if (!base) return null; // a package: outside the app graph
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

const importCache = new Map<string, string[]>();

/** Edges that exist at runtime: value imports and re-exports, not `import type`. */
function runtimeImports(file: string): string[] {
  const cached = importCache.get(file);
  if (cached) return cached;
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) {
      const clause = st.importClause;
      if (clause?.isTypeOnly) continue;
      const named = clause?.namedBindings;
      if (clause && !clause.name && named && ts.isNamedImports(named)
        && named.elements.length > 0 && named.elements.every((e) => e.isTypeOnly)) continue;
    } else if (ts.isExportDeclaration(st)) {
      if (st.isTypeOnly || !st.moduleSpecifier) continue;
    } else continue;
    const spec = st.moduleSpecifier;
    if (!spec || !ts.isStringLiteral(spec)) continue;
    const resolved = resolveSpecifier(spec.text, file);
    if (resolved) out.push(resolved);
  }
  importCache.set(file, out);
  return out;
}

/**
 * Breadth-first walk from `from` (path relative to the repo root). Returns
 * each reached file (relative) mapped to the file that first imported it.
 */
function walk(from: string, stopAt?: string): Map<string, string | null> {
  const start = path.join(ROOT, from);
  const prev = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const f = queue.shift()!;
    if (stopAt && f === stopAt) break;
    for (const d of runtimeImports(f)) if (!prev.has(d)) { prev.set(d, f); queue.push(d); }
  }
  return prev;
}

function chainTo(prev: Map<string, string | null>, goal: string): string[] {
  const chain: string[] = [];
  for (let f: string | null = goal; f; f = prev.get(f) ?? null) chain.unshift(path.relative(ROOT, f));
  return chain;
}

/** Shortest static import chain from -> to (repo-relative paths), or null. */
export function importChain(from: string, to: string): string[] | null {
  const goal = path.join(ROOT, to);
  const prev = walk(from, goal);
  return prev.has(goal) ? chainTo(prev, goal) : null;
}

/** Every file statically reachable from `from`, repo-relative, with the shortest chain to it. */
export function reachableFiles(from: string): Map<string, string[]> {
  const prev = walk(from);
  const out = new Map<string, string[]>();
  for (const f of prev.keys()) out.set(path.relative(ROOT, f), chainTo(prev, f));
  return out;
}
