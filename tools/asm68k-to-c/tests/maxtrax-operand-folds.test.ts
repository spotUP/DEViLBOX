import { preProcess } from '../src/preprocess.js';
import { tokenize } from '../src/lexer.js';
import { parse } from '../src/parser.js';
import { resolve } from '../src/resolver.js';
import { emit } from '../src/emitter.js';
import { scopeLocalLabels } from '../src/scope-locals.js';

function transpile(src: string, libMode = false): string {
  const source = preProcess(src);
  const ast = parse(tokenize(source));
  scopeLocalLabels(ast);
  return emit(ast, resolve(ast), 'test.asm', { libMode });
}

// -- Regression: negative symbolic displacement `-symbol(An)` ---------------
// MaxTrax's patch/channel init loops walk arrays downward with
// `lea -patch_sizeof(a3),a3`. The lexer used to drop the leading '-', turning
// the decrement into an increment — the loop then walked off the end of the
// _ds data section (OOB, SAFE_HEAP fault in OpenMusic). The sign must survive.
test('lea -symbol(An) decrements, does not increment', () => {
  const src = [
    'patch_sizeof\tEQU\t22',
    'Loop:',
    '\tlea\t-patch_sizeof(a3),a3',
    '\trts',
  ].join('\n');
  const out = transpile(src);
  // The emitted pointer update must SUBTRACT patch_sizeof, not add it.
  expect(out).toMatch(/a3\s*\+\s*\(\s*-\s*\(intptr_t\)patch_sizeof\s*\)/);
  // Must NOT be a bare `+ patch_sizeof` increment.
  expect(out).not.toMatch(/a3\s*=\s*\(uint32_t\)\(a3\s*\+\s*\(intptr_t\)patch_sizeof/);
});

// -- Regression: compound absolute address `$hwbase+symbol` -----------------
// MaxTrax's MusicServer reads the video beam via `move.w $00dff000+vhposr,d0`.
// The '+' is not an OPERATOR token, so the symbolic term used to split off as a
// phantom third operand, turning a 2-operand read into a null WRITE16 to the
// (undefined→0) symbol. The address must stay ONE read operand.
test('move.w $hwbase+symbol,d0 is a single read operand', () => {
  const src = [
    'Beam:',
    '\tmove.w\t$00dff000+vhposr,d0',
    '\trts',
  ].join('\n');
  const out = transpile(src);
  // Must read through hw_read16 with the folded address, into d0.
  expect(out).toMatch(/hw_read16\(0x00dff000\+vhposr\)/);
  // Must NOT emit a write to the offset symbol.
  expect(out).not.toMatch(/WRITE16\(\(uintptr_t\)vhposr/);
});

// The undefined offset symbol must still get a value stub so the C compiles.
test('unknown symbol inside a compound absolute address gets a #define stub', () => {
  const src = [
    'Beam:',
    '\tmove.w\t$00dff000+vhposr,d0',
    '\trts',
  ].join('\n');
  const out = transpile(src);
  expect(out).toContain('#define vhposr 0');
});

// -- Regression: fall-through across a function boundary --------------------
// MaxTrax's LoadPerf splits into many C functions (each PEA/RTS ReadFunc call is
// a split point). `.l75` (a CheckRead landing) ends with `addq.w #n,a3` and then
// FALLS THROUGH into `.l2`, which is a branch target from other split scopes and
// so gets promoted to its own C function. The emitter closed `.l75` after the
// addq WITHOUT emitting the tail call into `.l2` — so LoadPerf's entire sample-
// loading section (past `.l2`) became unreachable: patch_Sample stayed 0, NoteOn
// bailed at "no sample", and the song was SILENT. A non-terminator block that
// falls into a promoted-function label must emit an explicit `Label(); return;`.
test('non-terminator block falling into a cross-function label emits a tail call', () => {
  const src = [
    'score_sizeof\tEQU\t8',
    'Loader:',
    '\tpea\t.cont',                 // PEA/RTS idiom → forces a function split
    '\tmove.l\t_readfn,-(sp)',
    '\trts',
    '.cont:',
    '\taddq.w\t#score_sizeof,a3',   // non-terminator: MUST fall through to .loop
    '.loop:',
    '\tdbra\td5,.cont',
    '\tmoveq\t#1,d0',
    '\trts',
    '.retry:',
    '\tbra.s\t.loop',               // makes .loop a cross-function goto target
    '_readfn:\tdc.l\t0',
  ].join('\n');
  const out = transpile(src, true);
  // .loop is promoted to its own C function...
  expect(out).toMatch(/static void Loader_L_loop\(void\)/);
  // ...and .cont's addq must be followed by an explicit tail call into it, not a
  // bare closing brace that silently drops the fall-through.
  expect(out).toMatch(
    /ADDQ\.W\s+#score_sizeof,A3 \*\/\s*\n\s*Loader_L_loop\(\); return;/,
  );
});
