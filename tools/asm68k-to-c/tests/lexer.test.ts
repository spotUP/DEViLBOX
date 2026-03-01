import { tokenize } from '../src/lexer.js';

test('tokenizes a label', () => {
  const tokens = tokenize('PlayMusic:');
  expect(tokens[0]).toMatchObject({ kind: 'LABEL', value: 'PlayMusic' });
});

test('tokenizes MOVE.L d0,d1', () => {
  const tokens = tokenize('  MOVE.L  d0,d1');
  expect(tokens[0]).toMatchObject({ kind: 'MNEMONIC', value: 'MOVE' });
  expect(tokens[1]).toMatchObject({ kind: 'SIZE', value: '.L' });
  expect(tokens[2]).toMatchObject({ kind: 'REGISTER', value: 'd0' });
  expect(tokens[3]).toMatchObject({ kind: 'COMMA' });
  expect(tokens[4]).toMatchObject({ kind: 'REGISTER', value: 'd1' });
});

test('tokenizes EQU directive', () => {
  const tokens = tokenize('n_note  EQU 0');
  expect(tokens[0]).toMatchObject({ kind: 'IDENTIFIER', value: 'n_note' });
  expect(tokens[1]).toMatchObject({ kind: 'DIRECTIVE', value: 'EQU' });
  expect(tokens[2]).toMatchObject({ kind: 'NUMBER', value: '0' });
});

test('tokenizes DC.W data', () => {
  const tokens = tokenize('PeriodTable: DC.W $0358,$0328');
  expect(tokens[0]).toMatchObject({ kind: 'LABEL', value: 'PeriodTable' });
  expect(tokens[1]).toMatchObject({ kind: 'DIRECTIVE', value: 'DC' });
  expect(tokens[2]).toMatchObject({ kind: 'SIZE', value: '.W' });
  expect(tokens[3]).toMatchObject({ kind: 'NUMBER', value: '$0358' });
});

test('tokenizes indirect addressing', () => {
  const tokens = tokenize('  MOVE.W (a0)+,d0');
  expect(tokens[2]).toMatchObject({ kind: 'ADDRESS', value: '(a0)+' });
});

test('tokenizes displacement addressing', () => {
  const tokens = tokenize('  MOVE.W 4(a1),d0');
  expect(tokens[2]).toMatchObject({ kind: 'DISP_REG', value: '4(a1)' });
});

test('tokenizes absolute address (Paula register)', () => {
  const tokens = tokenize('  MOVE.W d0,$DFF0A6');
  expect(tokens[4]).toMatchObject({ kind: 'ABS_ADDR', value: '$DFF0A6' });
});

test('strips semicolon comments', () => {
  const tokens = tokenize('  MOVE.L d0,d1  ; copy d0');
  const nonComment = tokens.filter(t => t.kind !== 'COMMENT' && t.kind !== 'NEWLINE' && t.kind !== 'EOF');
  expect(nonComment).toHaveLength(5); // MNEMONIC SIZE REG COMMA REG
});

test('strips asterisk comments (line-start style)', () => {
  const tokens = tokenize('* This is a comment');
  const significant = tokens.filter(t => t.kind !== 'COMMENT' && t.kind !== 'NEWLINE' && t.kind !== 'EOF');
  expect(significant).toHaveLength(0);
});

test('handles lowercase mnemonics', () => {
  const tokens = tokenize('  move.l d0,d1');
  expect(tokens[0]).toMatchObject({ kind: 'MNEMONIC', value: 'MOVE' });
});
