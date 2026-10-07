/**
 * TypeScript-AST scan for call sites of the restricted song-open / export
 * functions (plan 2026-10-07-one-load-save-export-path, U4.0).
 *
 * Counted from the AST of every non-test .ts/.tsx file under src/: a call
 * expression whose callee is the bare identifier `name(...)` or a property
 * access `x.name(...)`, plus calls through an import alias
 * (`import { name as other }`). Comments and strings cannot match; definitions,
 * imports and re-exports are not calls.
 */
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

export const RESTRICTED = [
  'parseModuleToSong',
  'importTrackerModule',
  'importModuleFile',
  'prepareModuleImport',
  'applySong',
  'addCompanionFile',
  'downloadUADECompanions',
  'gatherCompanions',
  'exportWithOpenMPT',
  'exportSongToMOD',
  'exportNativeSong',
  'renderUADEToWav',
  'renderPatternToAudio',
  'captureAudioLiveToBuffer',
  // The UADE song scan (worker client and the worklet host it drives).
  'scan',
] as const;

/** key = `${file}|${enclosingFunction}|${callee}` -> number of calls */
export type CallMap = Record<string, number>;

const SKIP_DIR = new Set(['node_modules', '__tests__', '__mocks__']);

export function listSourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!SKIP_DIR.has(e.name)) walk(path.join(dir, e.name));
      } else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts')) {
        out.push(path.join(dir, e.name));
      }
    }
  };
  walk(root);
  return out.sort();
}

function enclosingName(node: ts.Node): string {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name) return n.name.getText();
    if (ts.isVariableDeclaration(n) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) {
      return n.name.getText();
    }
    if (ts.isPropertyAssignment(n) && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) {
      return n.name.getText();
    }
  }
  return '<module>';
}

export function scanSource(text: string, fileName: string, names: readonly string[] = RESTRICTED): CallMap {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const aliases = new Map<string, string>(); // local alias -> restricted name
  sf.forEachChild((n) => {
    if (ts.isImportDeclaration(n) && n.importClause?.namedBindings && ts.isNamedImports(n.importClause.namedBindings)) {
      for (const el of n.importClause.namedBindings.elements) {
        const orig = (el.propertyName ?? el.name).text;
        if (el.propertyName && names.includes(orig)) aliases.set(el.name.text, orig);
      }
    }
  });
  const map: CallMap = {};
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      let callee: string | undefined;
      const e = n.expression;
      if (ts.isIdentifier(e)) callee = e.text;
      else if (ts.isPropertyAccessExpression(e)) callee = e.name.text;
      if (callee) {
        callee = aliases.get(callee) ?? callee;
        if (names.includes(callee)) {
          const key = `${fileName}|${enclosingName(n)}|${callee}`;
          map[key] = (map[key] ?? 0) + 1;
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return map;
}

export function scanTree(srcRoot: string, repoRoot: string): CallMap {
  const all: CallMap = {};
  for (const f of listSourceFiles(srcRoot)) {
    const rel = path.relative(repoRoot, f).split(path.sep).join('/');
    Object.assign(all, scanSource(fs.readFileSync(f, 'utf8'), rel));
  }
  return all;
}
