/**
 * PSAParser Tests
 * Integration tests for Professional Sound Artists (PSA) format detection and parsing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isPSAFormat, parsePSAFile } from '../formats/PSAParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF_MUSIC  = resolve(import.meta.dirname, '../../../../Reference Music');
const PSA_FILE_1 = resolve(REF_MUSIC, 'Professional Sound Artists/Leggless/the punisher - title.psa');
const PSA_FILE_2 = resolve(REF_MUSIC, 'Professional Sound Artists/Leggless/test module.psa');

function loadAB(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// ── Detection ──────────────────────────────────────────────────────────────

describe('isPSAFormat', () => {
  it('detects the punisher title.psa', () => {
    expect(isPSAFormat(loadAB(PSA_FILE_1))).toBe(true);
  });

  it('detects test module.psa', () => {
    expect(isPSAFormat(loadAB(PSA_FILE_2))).toBe(true);
  });

  it('rejects all-zero buffer', () => {
    expect(isPSAFormat(new ArrayBuffer(256))).toBe(false);
  });

  it('rejects buffer too small', () => {
    expect(isPSAFormat(new ArrayBuffer(2))).toBe(false);
  });

  it('rejects buffer with wrong magic', () => {
    const buf = new Uint8Array(64).fill(0x41);
    expect(isPSAFormat(buf.buffer)).toBe(false);
  });

  it('accepts Uint8Array input', () => {
    const buf = readFileSync(PSA_FILE_1);
    expect(isPSAFormat(new Uint8Array(buf))).toBe(true);
  });
});

// ── Parsing ────────────────────────────────────────────────────────────────

describe('parsePSAFile — the punisher - title.psa', () => {
  it('parses without throwing', () => {
    expect(() => parsePSAFile(loadAB(PSA_FILE_1), 'the punisher - title.psa')).not.toThrow();
  });

  it('returns a defined TrackerSong', () => {
    const song = parsePSAFile(loadAB(PSA_FILE_1), 'the punisher - title.psa');
    expect(song).toBeDefined();
  });

  it('returns format MOD', () => {
    const song = parsePSAFile(loadAB(PSA_FILE_1), 'the punisher - title.psa');
    expect(song.format).toBe('MOD');
  });

  it('has 4 channels', () => {
    const song = parsePSAFile(loadAB(PSA_FILE_1), 'the punisher - title.psa');
    expect(song.numChannels).toBe(4);
  });

  it('has at least one pattern', () => {
    const song = parsePSAFile(loadAB(PSA_FILE_1), 'the punisher - title.psa');
    expect(song.patterns.length).toBeGreaterThanOrEqual(1);
  });

  it('has at least one instrument', () => {
    const song = parsePSAFile(loadAB(PSA_FILE_1), 'the punisher - title.psa');
    expect(song.instruments.length).toBeGreaterThanOrEqual(1);
  });

  it('has valid BPM and speed', () => {
    const song = parsePSAFile(loadAB(PSA_FILE_1), 'the punisher - title.psa');
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('includes PSA in the name', () => {
    const song = parsePSAFile(loadAB(PSA_FILE_1), 'the punisher - title.psa');
    expect(song.name).toContain('PSA');
  });

  it('logs format report', () => {
    const song = parsePSAFile(loadAB(PSA_FILE_1), 'the punisher - title.psa');
    const report = analyzeFormat(song, 'the punisher - title.psa');
    console.log(formatReportToString(report));
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parsePSAFile — test module.psa', () => {
  it('parses without throwing', () => {
    expect(() => parsePSAFile(loadAB(PSA_FILE_2), 'test module.psa')).not.toThrow();
  });

  it('returns format MOD', () => {
    const song = parsePSAFile(loadAB(PSA_FILE_2), 'test module.psa');
    expect(song.format).toBe('MOD');
  });
});
