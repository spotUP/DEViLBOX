/**
 * Local-label scoping pass.
 *
 * 68k assemblers scope dot-prefixed local labels (e.g. `.l2`, `.loop`) to the
 * most recent NON-local (global) label. The same `.l2` in two different
 * routines are distinct labels. The transpiler otherwise flattens both to
 * `_l2`, producing C-level collisions (duplicate label defs + ambiguous
 * gotos). This pass rewrites every local label — definition AND branch
 * reference — to a name unique to its enclosing global label, so downstream
 * resolve/emit see distinct identifiers.
 *
 * Runs on the parsed AST, in source order, before resolve().
 */
import type { AstNode } from './ast.js';

const isLocal = (name: string): boolean => name.startsWith('.');

export function scopeLocalLabels(ast: AstNode[]): void {
  let currentGlobal = '_G0'; // fallback scope if a local appears before any global label
  const scoped = (name: string): string => `${currentGlobal}_L_${name.slice(1)}`;

  for (const node of ast) {
    if (node.kind === 'label') {
      if (isLocal(node.name)) {
        node.name = scoped(node.name);
      } else {
        currentGlobal = node.name;
      }
      continue;
    }
    if (node.kind === 'instruction') {
      for (const op of node.operands) {
        if (op.kind === 'label_ref' && isLocal(op.name)) {
          op.name = scoped(op.name);
        } else if (op.kind === 'pc_rel' && isLocal(op.label)) {
          op.label = scoped(op.label);
        }
      }
    }
  }
}
