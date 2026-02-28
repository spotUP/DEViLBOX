/**
 * UADEParser Tests — UADE catch-all extension-based detection
 *
 * isUADEFormat checks filename extension against a known set of 130+ formats.
 * parseUADEFile is async and requires WASM; only the detector is tested here.
 *
 * Also tests tryExtractInstrumentNames for specific format handlers:
 *   - Oktalyzer (.okt/.okta): extracts names from SAMP chunk
 *   - MaxTrax (.mxtx): null guard (synthesis format)
 *   - Delitracker Custom (.cus/.cust/.custom): null guard (compiled executable)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isUADEFormat, tryExtractInstrumentNames } from '../formats/UADEParser';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');

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

// ── tryExtractInstrumentNames ───────────────────────────────────────────────

function loadAB(path: string): ArrayBuffer {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('tryExtractInstrumentNames — Oktalyzer (.okta)', () => {
  const OKTA_FILE = resolve(REF, 'Oktalyzer/Absys/les granges brulees.okta');

  it('extracts at least one non-empty sample name', () => {
    const names = tryExtractInstrumentNames(loadAB(OKTA_FILE), 'okta');
    expect(names).not.toBeNull();
    expect(names!.length).toBeGreaterThan(0);
    expect(names!.every(n => n.length > 0)).toBe(true);
  });

  it('returns null for zeroed buffer (no OKTASONG magic)', () => {
    expect(tryExtractInstrumentNames(new ArrayBuffer(256), 'okta')).toBeNull();
  });
});

describe('tryExtractInstrumentNames — null guards', () => {
  it('returns null for MaxTrax (.mxtx) — synthesis format', () => {
    const buf = loadAB(resolve(REF, 'MaxTrax/Steve Hales/antmusic.mxtx'));
    expect(tryExtractInstrumentNames(buf, 'mxtx')).toBeNull();
  });

  it('returns null for Delitracker Custom (.cus) — compiled executable', () => {
    // Use a zeroed buffer; the null guard fires before any content check.
    expect(tryExtractInstrumentNames(new ArrayBuffer(512), 'cus')).toBeNull();
  });

  it('returns null for Delitracker Custom (.cust)', () => {
    expect(tryExtractInstrumentNames(new ArrayBuffer(512), 'cust')).toBeNull();
  });
});
