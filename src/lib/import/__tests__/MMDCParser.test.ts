/**
 * MMDCParser Tests
 * Integration tests for MMDC (MED Packer) format detection and parsing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isMMDCFormat, parseMMDCFile } from '../formats/MMDCParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF_MUSIC  = resolve(import.meta.dirname, '../../../../Reference Music');
const MMDC_FILE  = resolve(REF_MUSIC, 'OctaMED MMDC/Richard Joseph/knightmare - title.mmdc');

function loadAB(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// ── Detection ──────────────────────────────────────────────────────────────

describe('isMMDCFormat', () => {
  it('detects a real MMDC file', () => {
    expect(isMMDCFormat(loadAB(MMDC_FILE))).toBe(true);
  });

  it('rejects all-zero buffer', () => {
    expect(isMMDCFormat(new ArrayBuffer(256))).toBe(false);
  });

  it('rejects buffer too small', () => {
    expect(isMMDCFormat(new ArrayBuffer(10))).toBe(false);
  });

  it('rejects buffer with wrong magic', () => {
    const buf = new Uint8Array(64).fill(0x41);
    expect(isMMDCFormat(buf.buffer)).toBe(false);
  });

  it('accepts Uint8Array input', () => {
    const buf = readFileSync(MMDC_FILE);
    expect(isMMDCFormat(new Uint8Array(buf))).toBe(true);
  });
});

// ── Parsing ────────────────────────────────────────────────────────────────

describe('parseMMDCFile', () => {
  it('parses without throwing', () => {
    expect(() => parseMMDCFile(loadAB(MMDC_FILE), 'knightmare - title.mmdc')).not.toThrow();
  });

  it('returns a defined TrackerSong', () => {
    const song = parseMMDCFile(loadAB(MMDC_FILE), 'knightmare - title.mmdc');
    expect(song).toBeDefined();
  });

  it('returns format MOD', () => {
    const song = parseMMDCFile(loadAB(MMDC_FILE), 'knightmare - title.mmdc');
    expect(song.format).toBe('MOD');
  });

  it('has 4 channels', () => {
    const song = parseMMDCFile(loadAB(MMDC_FILE), 'knightmare - title.mmdc');
    expect(song.numChannels).toBe(4);
  });

  it('has at least one pattern', () => {
    const song = parseMMDCFile(loadAB(MMDC_FILE), 'knightmare - title.mmdc');
    expect(song.patterns.length).toBeGreaterThanOrEqual(1);
  });

  it('has a valid song order', () => {
    const song = parseMMDCFile(loadAB(MMDC_FILE), 'knightmare - title.mmdc');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has valid BPM and speed', () => {
    const song = parseMMDCFile(loadAB(MMDC_FILE), 'knightmare - title.mmdc');
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('includes MMDC in the name', () => {
    const song = parseMMDCFile(loadAB(MMDC_FILE), 'knightmare - title.mmdc');
    expect(song.name).toContain('MMDC');
  });

  it('logs format report', () => {
    const song = parseMMDCFile(loadAB(MMDC_FILE), 'knightmare - title.mmdc');
    const report = analyzeFormat(song, 'knightmare - title.mmdc');
    console.log(formatReportToString(report));
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
