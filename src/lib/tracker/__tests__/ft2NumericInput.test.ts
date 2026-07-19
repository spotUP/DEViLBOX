import { describe, it, expect } from 'vitest';
import { parseFT2NumericInput } from '../ft2NumericInput';

/**
 * M5: FT2 numeric toolbar fields must accept a typed value, not only arrow
 * nudges. The commit rule (validate for the field's radix, clamp into range,
 * reject junk) is shared by the input's Enter/blur handlers and tested here.
 */
describe('parseFT2NumericInput (M5)', () => {
  it('parses a decimal string', () => {
    expect(parseFT2NumericInput('125', 'decimal', 0, 999)).toBe(125);
  });

  it('parses a hex string case-insensitively', () => {
    expect(parseFT2NumericInput('1f', 'hex', 0, 255)).toBe(0x1f);
    expect(parseFT2NumericInput('FF', 'hex', 0, 255)).toBe(255);
  });

  it('clamps above max and below min', () => {
    expect(parseFT2NumericInput('9999', 'decimal', 0, 255)).toBe(255);
    expect(parseFT2NumericInput('0', 'decimal', 1, 32)).toBe(1);
  });

  it('rejects an empty string', () => {
    expect(parseFT2NumericInput('', 'decimal', 0, 999)).toBeNull();
    expect(parseFT2NumericInput('   ', 'decimal', 0, 999)).toBeNull();
  });

  it('rejects non-numeric junk in decimal mode', () => {
    expect(parseFT2NumericInput('12a', 'decimal', 0, 999)).toBeNull();
    expect(parseFT2NumericInput('abc', 'decimal', 0, 999)).toBeNull();
  });

  it('rejects hex digits that decimal mode does not allow', () => {
    // 'f' is valid hex but must NOT be accepted for a decimal field.
    expect(parseFT2NumericInput('f', 'decimal', 0, 999)).toBeNull();
  });

  it('rejects characters outside the hex alphabet', () => {
    expect(parseFT2NumericInput('1g', 'hex', 0, 255)).toBeNull();
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseFT2NumericInput('  42 ', 'decimal', 0, 999)).toBe(42);
  });
});
