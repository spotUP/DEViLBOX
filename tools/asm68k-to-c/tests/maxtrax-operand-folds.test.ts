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
