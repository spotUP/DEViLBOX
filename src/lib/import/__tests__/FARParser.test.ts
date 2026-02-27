/**
 * FARParser Tests
 * Integration tests for Farandole Composer (.far) detection and parsing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isFARFormat, parseFARFile } from '../formats/FARParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF_MUSIC = resolve(import.meta.dirname, '../../../../Reference Music');
const FAR_FILE  = resolve(REF_MUSIC, 'Farandole Composer/4Go10/m31.far');

function loadAB(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// ── Detection ──────────────────────────────────────────────────────────────

describe('isFARFormat', () => {
  it('detects a real .far file', () => {
    expect(isFARFormat(loadAB(FAR_FILE))).toBe(true);
  });

  it('rejects all-zero buffer', () => {
    expect(isFARFormat(new ArrayBuffer(256))).toBe(false);
  });

  it('rejects buffer shorter than header', () => {
    expect(isFARFormat(new ArrayBuffer(10))).toBe(false);
  });

  it('rejects buffer with wrong magic', () => {
    const buf = new Uint8Array(128).fill(0x41);
    expect(isFARFormat(buf.buffer)).toBe(false);
  });
});

// ── Parsing ────────────────────────────────────────────────────────────────

describe('parseFARFile', () => {
  it('parses without throwing', async () => {
    await expect(parseFARFile(loadAB(FAR_FILE), 'm31.far')).resolves.toBeDefined();
  });

  it('returns format MOD', async () => {
    const song = await parseFARFile(loadAB(FAR_FILE), 'm31.far');
    expect(song.format).toBe('MOD');
  });

  it('has 16 channels', async () => {
    const song = await parseFARFile(loadAB(FAR_FILE), 'm31.far');
    expect(song.numChannels).toBe(16);
  });

  it('has at least one pattern', async () => {
    const song = await parseFARFile(loadAB(FAR_FILE), 'm31.far');
    expect(song.patterns.length).toBeGreaterThanOrEqual(1);
  });

  it('has a valid song order', async () => {
    const song = await parseFARFile(loadAB(FAR_FILE), 'm31.far');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has valid BPM and speed', async () => {
    const song = await parseFARFile(loadAB(FAR_FILE), 'm31.far');
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('logs format report', async () => {
    const song = await parseFARFile(loadAB(FAR_FILE), 'm31.far');
    const report = analyzeFormat(song, 'm31.far');
    console.log(formatReportToString(report));
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
