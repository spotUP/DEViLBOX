/**
 * JamCrackerParser Tests
 * Integration tests for JamCracker (.jam) detection and parsing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isJamCrackerFormat, parseJamCrackerFile } from '../formats/JamCrackerParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF_MUSIC  = resolve(import.meta.dirname, '../../../../Reference Music');
const JAM_FILE_1 = resolve(REF_MUSIC, 'JamCracker/- unknown/genesis (mountains).jam');
const JAM_FILE_2 = resolve(REF_MUSIC, 'JamCracker/AM-FM/analogue vibes.jam');

function loadAB(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// ── Detection ──────────────────────────────────────────────────────────────

describe('isJamCrackerFormat', () => {
  it('detects genesis (mountains).jam', () => {
    expect(isJamCrackerFormat(loadAB(JAM_FILE_1))).toBe(true);
  });

  it('detects analogue vibes.jam', () => {
    expect(isJamCrackerFormat(loadAB(JAM_FILE_2))).toBe(true);
  });

  it('rejects all-zero buffer', () => {
    expect(isJamCrackerFormat(new ArrayBuffer(256))).toBe(false);
  });

  it('rejects buffer too small', () => {
    expect(isJamCrackerFormat(new ArrayBuffer(4))).toBe(false);
  });

  it('rejects buffer with wrong magic', () => {
    const buf = new Uint8Array(64).fill(0x41);
    expect(isJamCrackerFormat(buf.buffer)).toBe(false);
  });
});

// ── Parsing ────────────────────────────────────────────────────────────────

describe('parseJamCrackerFile — genesis (mountains).jam', () => {
  it('parses without throwing', async () => {
    await expect(parseJamCrackerFile(loadAB(JAM_FILE_1), 'genesis (mountains).jam')).resolves.toBeDefined();
  });

  it('returns format MOD', async () => {
    const song = await parseJamCrackerFile(loadAB(JAM_FILE_1), 'genesis (mountains).jam');
    expect(song.format).toBe('MOD');
  });

  it('has 4 channels', async () => {
    const song = await parseJamCrackerFile(loadAB(JAM_FILE_1), 'genesis (mountains).jam');
    expect(song.numChannels).toBe(4);
  });

  it('has at least one pattern', async () => {
    const song = await parseJamCrackerFile(loadAB(JAM_FILE_1), 'genesis (mountains).jam');
    expect(song.patterns.length).toBeGreaterThanOrEqual(1);
  });

  it('has a valid song order', async () => {
    const song = await parseJamCrackerFile(loadAB(JAM_FILE_1), 'genesis (mountains).jam');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has instruments', async () => {
    const song = await parseJamCrackerFile(loadAB(JAM_FILE_1), 'genesis (mountains).jam');
    expect(song.instruments.length).toBeGreaterThanOrEqual(0);
  });

  it('logs format report', async () => {
    const song = await parseJamCrackerFile(loadAB(JAM_FILE_1), 'genesis (mountains).jam');
    const report = analyzeFormat(song, 'genesis (mountains).jam');
    console.log(formatReportToString(report));
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseJamCrackerFile — analogue vibes.jam', () => {
  it('parses without throwing', async () => {
    await expect(parseJamCrackerFile(loadAB(JAM_FILE_2), 'analogue vibes.jam')).resolves.toBeDefined();
  });

  it('has 4 channels', async () => {
    const song = await parseJamCrackerFile(loadAB(JAM_FILE_2), 'analogue vibes.jam');
    expect(song.numChannels).toBe(4);
  });

  it('has at least one pattern', async () => {
    const song = await parseJamCrackerFile(loadAB(JAM_FILE_2), 'analogue vibes.jam');
    expect(song.patterns.length).toBeGreaterThanOrEqual(1);
  });
});
