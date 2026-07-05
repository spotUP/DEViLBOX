import { readFileSync } from 'fs';
import { tokenize } from '../src/lexer.js';
import { parse } from '../src/parser.js';
import { resolve } from '../src/resolver.js';
import { emit } from '../src/emitter.js';

test('emits valid C for simple replayer fixture', () => {
  const src = readFileSync('tests/fixtures/simple.asm', 'utf8');
  const ast = parse(tokenize(src));
  const output = emit(ast, resolve(ast));
  expect(output).toContain('void InitPlay(');
  expect(output).toContain('void PlayMusic(');
  expect(output).toContain('paula_set_volume(0,');
  expect(output).toContain('paula_set_period(0,');
  expect(output).toContain('return;');
  expect(output).toMatch(/#define SongData \(\(uint16_t\*\)\(_ds \+/);
});

// Regression: a CONDITIONAL branch to a cross-function target emits
// `if (cond) { Fault(); return; }`. That text contains `return;` but the branch is
// NOT an unconditional exit — when the condition is false, execution falls through
// into the next label. The emitter used to close the function on any `return;` in the
// emitted line, wrongly splitting a contiguous mutually-branching block (Sonix
// SecPass<->OK1) into two C functions, producing duplicate/undeclared C labels that
// gcc rejects. The label after a conditional cross-function branch must stay INLINE.
test('conditional branch to cross-function target does not split the following label', () => {
  const asm = [
    'Play:', '\tbsr Sub', '\trts',
    'Sub:', '\tmoveq #3,d1',
    'Loop:', '\ttst.b (a0)', '\tbmi.b Fault',
    '\tcmp.w #-1,(a0)', '\tbeq.b Cont', '\tbhi.b Fault',
    'Cont:', '\tadd.l (a1)+,a0', '\tdbf d1,Loop', '\trts',
    'Fault:', '\tmoveq #0,d0', '\trts',
  ].join('\n');
  const ast = parse(tokenize(asm));
  const out = emit(ast, resolve(ast));
  // Cont stays an inline goto label, NOT promoted to its own C function.
  expect(out).not.toMatch(/void\s+Cont\s*\(/);
  expect(out).toMatch(/^Cont:/m);
  // The forward branch to Cont and the dbf back-branch to Loop stay intra-function gotos.
  expect(out).toContain('goto Cont');
  expect(out).toContain('goto Loop');
  // The genuine cross-function branch is still emitted as a call.
  expect(out).toContain('Fault(); return;');
});

test('emitter output has required preamble', () => {
  const src = readFileSync('tests/fixtures/simple.asm', 'utf8');
  const ast = parse(tokenize(src));
  const output = emit(ast, resolve(ast));
  expect(output).toMatch(/^#include "paula_soft\.h"/m);
  expect(output).toMatch(/#define W\(r\)/m);
  expect(output).toMatch(/#define B\(r\)/m);
});
