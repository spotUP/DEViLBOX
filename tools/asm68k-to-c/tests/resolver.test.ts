import { tokenize } from '../src/lexer.js';
import { parse } from '../src/parser.js';
import { resolve } from '../src/resolver.js';

test('builds symbol table from EQU constants', () => {
  const ast = parse(tokenize('n_note EQU 0\nn_period EQU 16'));
  const { symbols } = resolve(ast);
  expect(symbols.get('n_note')).toBe(0);
  expect(symbols.get('n_period')).toBe(16);
});

test('collects all labels', () => {
  const ast = parse(tokenize('PlayMusic:\n  MOVE.L d0,d1\nEndPlay:\n  RTS'));
  const { labels } = resolve(ast);
  expect(labels.has('PlayMusic')).toBe(true);
  expect(labels.has('EndPlay')).toBe(true);
});

test('collects XDEF exports', () => {
  const ast = parse(tokenize('  XDEF _mt_init\n  XDEF _mt_music'));
  const { exports: xdefs } = resolve(ast);
  expect(xdefs).toContain('_mt_init');
  expect(xdefs).toContain('_mt_music');
});

test('identifies Paula register writes', () => {
  const ast = parse(tokenize('  MOVE.W d0,$DFF0A6'));
  const { paulaWrites } = resolve(ast);
  expect(paulaWrites.length).toBeGreaterThan(0);
  expect(paulaWrites[0]).toMatchObject({ channel: 0, register: 'period' });
});
