/**
 * PumaTrackerParser Tests
 * Integration tests for PumaTracker (.puma) format detection and parsing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isPumaTrackerFormat, parsePumaTrackerFile } from '../formats/PumaTrackerParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF_MUSIC   = resolve(import.meta.dirname, '../../../../Reference Music');
const PUMA_FILE_1 = resolve(REF_MUSIC, 'Pumatracker/- unknown/muspe1.puma');
const PUMA_FILE_2 = resolve(REF_MUSIC, 'Pumatracker/Cyfrak/cyf-3-final-2.puma');

function loadAB(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// ── Detection ──────────────────────────────────────────────────────────────

describe('isPumaTrackerFormat', () => {
  it('detects muspe1.puma', () => {
    expect(isPumaTrackerFormat(loadAB(PUMA_FILE_1))).toBe(true);
  });

  it('detects cyf-3-final-2.puma', () => {
    expect(isPumaTrackerFormat(loadAB(PUMA_FILE_2))).toBe(true);
  });

  it('rejects all-zero buffer', () => {
    expect(isPumaTrackerFormat(new ArrayBuffer(256))).toBe(false);
  });

  it('rejects buffer too small', () => {
    expect(isPumaTrackerFormat(new ArrayBuffer(10))).toBe(false);
  });

  it('rejects buffer with wrong content', () => {
    const buf = new Uint8Array(256).fill(0xFF);
    expect(isPumaTrackerFormat(buf.buffer)).toBe(false);
  });
});

// ── Parsing ────────────────────────────────────────────────────────────────

describe('parsePumaTrackerFile — muspe1.puma', () => {
  it('parses without throwing', async () => {
    await expect(parsePumaTrackerFile(loadAB(PUMA_FILE_1), 'muspe1.puma')).resolves.toBeDefined();
  });

  it('returns format MOD', async () => {
    const song = await parsePumaTrackerFile(loadAB(PUMA_FILE_1), 'muspe1.puma');
    expect(song.format).toBe('MOD');
  });

  it('has 4 channels', async () => {
    const song = await parsePumaTrackerFile(loadAB(PUMA_FILE_1), 'muspe1.puma');
    expect(song.numChannels).toBe(4);
  });

  it('has at least one pattern', async () => {
    const song = await parsePumaTrackerFile(loadAB(PUMA_FILE_1), 'muspe1.puma');
    expect(song.patterns.length).toBeGreaterThanOrEqual(1);
  });

  it('has a valid song order', async () => {
    const song = await parsePumaTrackerFile(loadAB(PUMA_FILE_1), 'muspe1.puma');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has valid BPM and speed', async () => {
    const song = await parsePumaTrackerFile(loadAB(PUMA_FILE_1), 'muspe1.puma');
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('has instruments', async () => {
    const song = await parsePumaTrackerFile(loadAB(PUMA_FILE_1), 'muspe1.puma');
    expect(song.instruments.length).toBeGreaterThanOrEqual(1);
  });

  it('logs format report', async () => {
    const song = await parsePumaTrackerFile(loadAB(PUMA_FILE_1), 'muspe1.puma');
    const report = analyzeFormat(song, 'muspe1.puma');
    console.log(formatReportToString(report));
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parsePumaTrackerFile — cyf-3-final-2.puma', () => {
  it('parses without throwing', async () => {
    await expect(parsePumaTrackerFile(loadAB(PUMA_FILE_2), 'cyf-3-final-2.puma')).resolves.toBeDefined();
  });

  it('has 4 channels', async () => {
    const song = await parsePumaTrackerFile(loadAB(PUMA_FILE_2), 'cyf-3-final-2.puma');
    expect(song.numChannels).toBe(4);
  });

  it('has at least one pattern', async () => {
    const song = await parsePumaTrackerFile(loadAB(PUMA_FILE_2), 'cyf-3-final-2.puma');
    expect(song.patterns.length).toBeGreaterThanOrEqual(1);
  });
});
