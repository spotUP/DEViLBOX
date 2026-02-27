/**
 * DeltaMusic2Parser Tests - Format capability analysis
 *
 * API: isDeltaMusic2Format(bytes: Uint8Array): boolean
 *      parseDeltaMusic2File(bytes: Uint8Array, filename: string): TrackerSong | null  (sync)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isDeltaMusic2Format, parseDeltaMusic2File } from '../formats/DeltaMusic2Parser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const DM2_DIR = resolve(REF, 'Delta Music 2/Top');
const FILE1 = resolve(DM2_DIR, 'asperity megademo 3.dm2');
const FILE2 = resolve(DM2_DIR, 'asperity megademo menu.dm2');
const FILE3 = resolve(DM2_DIR, 'asperity megademo 4.dm2');

function loadU8(p: string): Uint8Array {
  return new Uint8Array(readFileSync(p));
}

// ── Detection ─────────────────────────────────────────────────────────────────

describe('isDeltaMusic2Format', () => {
  it('detects asperity megademo 3.dm2', () => {
    expect(isDeltaMusic2Format(loadU8(FILE1))).toBe(true);
  });
  it('detects asperity megademo menu.dm2', () => {
    expect(isDeltaMusic2Format(loadU8(FILE2))).toBe(true);
  });
  it('detects asperity megademo 4.dm2', () => {
    expect(isDeltaMusic2Format(loadU8(FILE3))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isDeltaMusic2Format(new Uint8Array(64))).toBe(false);
  });
});

// ── Parse FILE1 — asperity megademo 3.dm2 ────────────────────────────────────

describe('parseDeltaMusic2File — asperity megademo 3.dm2', () => {
  it('parses without returning null', () => {
    const song = parseDeltaMusic2File(loadU8(FILE1), 'asperity megademo 3.dm2');
    expect(song).not.toBeNull();
  });
  it('reports format capabilities', () => {
    const song = parseDeltaMusic2File(loadU8(FILE1), 'asperity megademo 3.dm2');
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'asperity megademo 3.dm2');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

// ── Parse FILE2 — asperity megademo menu.dm2 ─────────────────────────────────

describe('parseDeltaMusic2File — asperity megademo menu.dm2', () => {
  it('parses without returning null', () => {
    const song = parseDeltaMusic2File(loadU8(FILE2), 'asperity megademo menu.dm2');
    expect(song).not.toBeNull();
  });
  it('reports format capabilities', () => {
    const song = parseDeltaMusic2File(loadU8(FILE2), 'asperity megademo menu.dm2');
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'asperity megademo menu.dm2');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

// ── Parse FILE3 — asperity megademo 4.dm2 ────────────────────────────────────

describe('parseDeltaMusic2File — asperity megademo 4.dm2', () => {
  it('parses without returning null', () => {
    const song = parseDeltaMusic2File(loadU8(FILE3), 'asperity megademo 4.dm2');
    expect(song).not.toBeNull();
  });
  it('reports format capabilities', () => {
    const song = parseDeltaMusic2File(loadU8(FILE3), 'asperity megademo 4.dm2');
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'asperity megademo 4.dm2');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
