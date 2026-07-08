import { preProcess } from '../src/preprocess.js';
import { tokenize } from '../src/lexer.js';
import { parse } from '../src/parser.js';
import { resolve } from '../src/resolver.js';
import { emit } from '../src/emitter.js';
import { scopeLocalLabels } from '../src/scope-locals.js';

function transpile(src: string): string {
  const source = preProcess(src);
  const ast = parse(tokenize(source));
  scopeLocalLabels(ast);
  return emit(ast, resolve(ast), 'test.asm');
}

// Regression: macro argument substitution (\1) — JSRLIB AllocMem must expand
// `jsr _LVO\1(a6)` to a call carrying the AllocMem name, not a bare `_LVO`.
test('expands macro \\1 argument into the body', () => {
  const src = `
JSRLIB\tmacro
\tjsr\t_LVO\\1(a6)
\tendm

Routine:
\tJSRLIB\tAllocMem
\trts
`;
  const out = transpile(src);
  expect(out).toContain('_LVOAllocMem()');
  expect(out).not.toMatch(/\b_LVO\(\)/); // no name-dropped bare _LVO() call
});

// Regression: AmigaOS library/device calls emit as DIRECT named calls with
// weak override-able stubs (so a harness can supply the real exec/audio.device
// shim), not unresolved jump-table reads or `#define _LVOxxx 0`.
test('emits named library calls with weak stubs', () => {
  const src = `
JSRLIB\tmacro
\tjsr\t_LVO\\1(a6)
\tendm
JSRDEV\tmacro
\tjsr\tDEV_\\1(a6)
\tendm

Routine:
\tJSRLIB\tOpenDevice
\tJSRDEV\tBEGINIO
\trts
`;
  const out = transpile(src);
  expect(out).toContain('_LVOOpenDevice()');
  expect(out).toContain('DEV_BEGINIO()');
  expect(out).toMatch(/__attribute__\(\(weak\)\) void _LVOOpenDevice\(void\)/);
  expect(out).toMatch(/__attribute__\(\(weak\)\) void DEV_BEGINIO\(void\)/);
  // Must NOT fall back to a numeric #define that would make _LVOOpenDevice() = 0().
  expect(out).not.toContain('#define _LVOOpenDevice 0');
});

// Regression: dot-local labels are scoped to their enclosing global label, so
// the same `.loop` in two routines does not collide into one C label.
test('scopes dot-local labels per enclosing global label', () => {
  const src = `
RoutineA:
\ttst.w\td0
.loop:
\tbne.s\t.loop
\trts
RoutineB:
\ttst.w\td1
.loop:
\tbne.s\t.loop
\trts
`;
  const out = transpile(src);
  // Two distinct scoped labels, each self-referential — no duplicate-label error.
  expect(out).toContain('RoutineA_L_loop');
  expect(out).toContain('RoutineB_L_loop');
  // The bare flattened name must not appear as a label definition.
  expect(out).not.toMatch(/^\s*_loop:/m);
});
