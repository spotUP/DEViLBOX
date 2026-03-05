import { restructure } from '../src/restructure.js';

test('converts DBRA goto pattern to for loop', () => {
  const input = `
  d0 = 10;
loop:
  a0 += 2;
  if ((int16_t)(--d0) >= 0) goto loop;
`;
  const out = restructure(input);
  expect(out).toContain('for (');
  expect(out).not.toContain('goto loop');
});

test('converts MOVEQ-style DBRA to for loop', () => {
  const input = `  d1 = (uint32_t)(int32_t)(int8_t)(3);  /* MOVEQ #3,D1 */
  a2 = (uint32_t)0xDFF0A0;  /* LEA $DFF0A0,A2 */
SetNew:
  a0 += 2;
  if ((int16_t)(--d1) >= 0) goto SetNew;  /* DBF D1,SetNew */
`;
  const out = restructure(input);
  expect(out).toContain('for (int _i_d1 = 3');
  expect(out).not.toContain('goto SetNew');
  expect(out).toContain('a2 = ');  // intermediate line preserved
});

test('converts simple if-goto-skip to if block', () => {
  const input = `
  if (!flag_z) goto skip_0;
  d0 = 42;
skip_0:
  d1 = 0;
`;
  const out = restructure(input);
  expect(out).toContain('if (flag_z)');
  expect(out).toContain('{');
});

test('converts compound condition skip', () => {
  const input = `  if (flag_n==flag_v) goto lbC001234;  /* BGE */
  d0 = 42;
lbC001234:
`;
  const out = restructure(input);
  expect(out).toContain('if (!(flag_n==flag_v))');
  expect(out).toContain('{');
  expect(out).not.toContain('goto lbC001234');
});

test('converts do-while with nested-paren condition', () => {
  const input = `lbC01E490:
  a0 = a0 + 2;
  if ((int16_t)(--d7) >= 0) goto lbC01E490;  /* DBRA */
`;
  const out = restructure(input);
  expect(out).toContain('do {');
  expect(out).toContain('while ((int16_t)(--d7) >= 0)');
  expect(out).not.toContain('goto lbC01E490');
});

test('converts if-else pattern', () => {
  const input = `  if (flag_z) goto lbElse;  /* BEQ */
  d0 = 1;
  goto lbEnd;  /* BRA */
lbElse:
  d0 = 2;
lbEnd:
  d1 = 0;
`;
  const out = restructure(input);
  expect(out).toContain('if (!(flag_z))');
  expect(out).toContain('d0 = 1;');
  expect(out).toContain('else');
  expect(out).toContain('d0 = 2;');
  expect(out).not.toContain('goto lbElse');
  expect(out).not.toContain('goto lbEnd');
});

test('leaves unrecognised patterns unchanged', () => {
  const input = `  goto somewhere_complex;`;
  expect(restructure(input)).toBe(input);
});

test('does not convert skip when label is used in body', () => {
  const input = `  if (!flag_z) goto target;  /* BNE */
  if (flag_c) goto target;
target:
`;
  const out = restructure(input);
  expect(out).toContain('goto target');
});
