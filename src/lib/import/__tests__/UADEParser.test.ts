/**
 * UADEParser Tests — UADE catch-all extension-based detection
 *
 * isUADEFormat checks filename extension against a known set of 130+ formats.
 * parseUADEFile is async and requires WASM; only the detector is tested here.
 */
import { describe, it, expect } from 'vitest';
import { isUADEFormat } from '../formats/UADEParser';

describe('isUADEFormat', () => {
  it('detects .sun extension (SunTronic)', () => {
    expect(isUADEFormat('SunTronic.TSM.pseudo oops.sun')).toBe(true);
  });

  it('detects .aon extension (Art of Noise)', () => {
    expect(isUADEFormat('test.aon')).toBe(true);
  });

  it('detects .bp extension (BP SoundMon 2)', () => {
    expect(isUADEFormat('test.bp')).toBe(true);
  });

  it('detects .bss extension (Beathoven Synthesizer)', () => {
    expect(isUADEFormat('test.bss')).toBe(true);
  });

  it('detects .bd extension (Ben Daglish)', () => {
    expect(isUADEFormat('test.bd')).toBe(true);
  });

  it('detects case-insensitive extension', () => {
    expect(isUADEFormat('test.AON')).toBe(true);
  });

  it('rejects unknown extension', () => {
    expect(isUADEFormat('test.unknown123')).toBe(false);
  });

  it('rejects file with no extension', () => {
    expect(isUADEFormat('nodot')).toBe(false);
  });

  it('rejects .ts extension', () => {
    expect(isUADEFormat('source.ts')).toBe(false);
  });
});
