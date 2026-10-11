/**
 * The stores never statically import the code that snapshots them.
 *
 * snapshotSong reads every song store at call time. When a store's own static
 * import graph led back to snapshotSong, the two sat in one import cycle:
 *
 *   useInstrumentStore -> TrackerReplayer -> AutomationPlayer -> parameterRouter
 *   -> DJActions -> DJAutoDJ -> DJTrackLoader -> openSong -> songBranches
 *   -> useProjectPersistence -> snapshotSong -> useInstrumentStore
 *
 * The closing edge was songBranches importing clearExplicitlySaved from the
 * persistence hook (now lib/persistence/explicitSave.ts, a leaf). Inside a
 * cycle the module runner hands a concurrent importer the partial exports of a
 * module still evaluating, so a second load racing the first (a test whose
 * import outlived its timeout - savedProjectAfterAhx in the pre-push gate)
 * ran snapshotSong against an undefined useInstrumentStore.
 *
 * Counted from the TypeScript AST of the real sources: static `import` /
 * `export ... from` edges that survive compilation (type-only imports are
 * erased and skipped; dynamic import() is a call-time edge and does not close
 * a static cycle). Path aliases mirror vite.config.ts.
 */
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');
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

/** Edges that exist at runtime: value imports and re-exports, not `import type`. */
function runtimeImports(file: string): string[] {
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
  return out;
}

/** Shortest static import chain from -> to, or null. */
function importChain(from: string, to: string): string[] | null {
  const start = path.join(ROOT, from), goal = path.join(ROOT, to);
  const prev = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const f = queue.shift()!;
    if (f === goal) break;
    for (const d of runtimeImports(f)) if (!prev.has(d)) { prev.set(d, f); queue.push(d); }
  }
  if (!prev.has(goal)) return null;
  const chain: string[] = [];
  for (let f: string | null = goal; f; f = prev.get(f) ?? null) chain.unshift(path.relative(ROOT, f));
  return chain;
}

describe('the song stores and the code that snapshots them', () => {
  it('useInstrumentStore never statically imports snapshotSong or the project persistence', () => {
    // Sanity: the reverse edge is real, so a path back would be a cycle.
    expect(importChain('src/lib/song/snapshotSong.ts', 'src/stores/useInstrumentStore.ts')).not.toBeNull();

    expect(importChain('src/stores/useInstrumentStore.ts', 'src/lib/song/snapshotSong.ts')).toBeNull();
    expect(importChain('src/stores/useInstrumentStore.ts', 'src/hooks/useProjectPersistence.ts')).toBeNull();
  }, 60000);
});
