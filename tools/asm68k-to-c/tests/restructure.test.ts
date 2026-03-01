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

test('leaves unrecognised patterns unchanged', () => {
  const input = `  goto somewhere_complex;`;
  expect(restructure(input)).toBe(input);
});
