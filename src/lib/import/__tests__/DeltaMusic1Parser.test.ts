/**
 * DeltaMusic1Parser Tests - Format capability analysis
 *
 * API: isDeltaMusic1Format(buffer: ArrayBuffer): boolean
 *      parseDeltaMusic1File(buffer: ArrayBuffer, filename: string): Promise<TrackerSong>  (async)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isDeltaMusic1Format, parseDeltaMusic1File } from '../formats/DeltaMusic1Parser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const DM_DIR = resolve(REF, 'Delta Music/Shogun');
const FILE1 = resolve(DM_DIR, 'triplex1.dm');
const FILE2 = resolve(DM_DIR, 'c64style.dm');
const FILE3 = resolve(DM_DIR, 'sweet dreams.dm');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

// ── Detection ─────────────────────────────────────────────────────────────────

describe('isDeltaMusic1Format', () => {
  it('detects triplex1.dm', () => {
    expect(isDeltaMusic1Format(loadBuf(FILE1))).toBe(true);
  });
  it('detects c64style.dm', () => {
    expect(isDeltaMusic1Format(loadBuf(FILE2))).toBe(true);
  });
  it('detects sweet dreams.dm', () => {
    expect(isDeltaMusic1Format(loadBuf(FILE3))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isDeltaMusic1Format(new ArrayBuffer(64))).toBe(false);
  });
});

// ── Parse FILE1 — triplex1.dm ─────────────────────────────────────────────────

describe('parseDeltaMusic1File — triplex1.dm', () => {
  it('parses without throwing', async () => {
    await expect(
      parseDeltaMusic1File(loadBuf(FILE1), 'triplex1.dm')
    ).resolves.not.toThrow();
  });
  it('reports format capabilities', async () => {
    const song = await parseDeltaMusic1File(loadBuf(FILE1), 'triplex1.dm');
    const report = analyzeFormat(song, 'triplex1.dm');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

// ── Parse FILE2 — c64style.dm ─────────────────────────────────────────────────

describe('parseDeltaMusic1File — c64style.dm', () => {
  it('parses without throwing', async () => {
    await expect(
      parseDeltaMusic1File(loadBuf(FILE2), 'c64style.dm')
    ).resolves.not.toThrow();
  });
  it('reports format capabilities', async () => {
    const song = await parseDeltaMusic1File(loadBuf(FILE2), 'c64style.dm');
    const report = analyzeFormat(song, 'c64style.dm');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

// ── Parse FILE3 — sweet dreams.dm ────────────────────────────────────────────

describe('parseDeltaMusic1File — sweet dreams.dm', () => {
  it('parses without throwing', async () => {
    await expect(
      parseDeltaMusic1File(loadBuf(FILE3), 'sweet dreams.dm')
    ).resolves.not.toThrow();
  });
  it('reports format capabilities', async () => {
    const song = await parseDeltaMusic1File(loadBuf(FILE3), 'sweet dreams.dm');
    const report = analyzeFormat(song, 'sweet dreams.dm');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
