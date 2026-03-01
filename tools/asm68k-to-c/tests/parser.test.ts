import { tokenize } from '../src/lexer.js';
import { parse } from '../src/parser.js';

test('parses EQU constant', () => {
  const ast = parse(tokenize('n_note  EQU 0'));
  expect(ast[0]).toMatchObject({ kind: 'equ', name: 'n_note', value: 0 });
});

test('parses MOVE.L d0,d1 instruction', () => {
  const ast = parse(tokenize('  MOVE.L d0,d1'));
  expect(ast[0]).toMatchObject({
    kind: 'instruction',
    mnemonic: 'MOVE',
    size: 'L',
    operands: [
      { kind: 'register', name: 'd0' },
      { kind: 'register', name: 'd1' },
    ],
  });
});

test('parses label then instruction', () => {
  const ast = parse(tokenize('PlayMusic:\n  MOVE.L d0,d1'));
  expect(ast[0]).toMatchObject({ kind: 'label', name: 'PlayMusic' });
  expect(ast[1]).toMatchObject({ kind: 'instruction', mnemonic: 'MOVE' });
});

test('parses DC.W data with label', () => {
  const ast = parse(tokenize('PeriodTable: DC.W $0358,$0328'));
  expect(ast[0]).toMatchObject({ kind: 'label', name: 'PeriodTable' });
  expect(ast[1]).toMatchObject({
    kind: 'data',
    directive: 'DC',
    size: 'W',
    values: [0x0358, 0x0328],
  });
});

test('parses MOVE.W d0,$DFF0A6 (Paula write)', () => {
  const ast = parse(tokenize('  MOVE.W d0,$DFF0A6'));
  const instr = ast[0] as any;
  expect(instr.operands[1]).toMatchObject({
    kind: 'abs_addr',
    value: 0xdff0a6,
    tag: 'paula',
  });
});

test('parses BSR label_ref', () => {
  const ast = parse(tokenize('  BSR.W PlayTick'));
  expect(ast[0]).toMatchObject({
    kind: 'instruction',
    mnemonic: 'BSR',
    operands: [{ kind: 'label_ref', name: 'PlayTick' }],
  });
});

test('parses MOVEM.L d0-d3/a0,-(sp)', () => {
  const ast = parse(tokenize('  MOVEM.L d0-d3/a0,-(sp)'));
  expect(ast[0]).toMatchObject({ kind: 'instruction', mnemonic: 'MOVEM', size: 'L' });
});

test('parses XDEF exports', () => {
  const ast = parse(tokenize('  XDEF _mt_init'));
  expect(ast[0]).toMatchObject({ kind: 'xdef', name: '_mt_init' });
});

test('parses PC-relative operand label(PC)', () => {
  const ast = parse(tokenize('  MOVE.L PlayTick(PC),a0'));
  const instr = ast[0] as any;
  expect(instr.operands[0]).toMatchObject({ kind: 'pc_rel', label: 'PlayTick' });
});
