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
  expect(output).toContain('static const uint16_t SongData[]');
});

test('emitter output has required preamble', () => {
  const src = readFileSync('tests/fixtures/simple.asm', 'utf8');
  const ast = parse(tokenize(src));
  const output = emit(ast, resolve(ast));
  expect(output).toMatch(/^#include "paula_soft\.h"/m);
  expect(output).toMatch(/#define W\(r\)/m);
  expect(output).toMatch(/#define B\(r\)/m);
});
