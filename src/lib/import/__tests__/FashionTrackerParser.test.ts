/**
 * FashionTrackerParser Tests
 * Integration tests for Fashion Tracker (.ex) detection and parsing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isFashionTrackerFormat, parseFashionTrackerFile } from '../formats/FashionTrackerParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF_MUSIC = resolve(import.meta.dirname, '../../../../Reference Music');
const EX_FILE   = resolve(REF_MUSIC, 'Fashion Tracker/Richard van de Veen/fashionating 1.ex');

function loadAB(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// ── Detection ──────────────────────────────────────────────────────────────

describe('isFashionTrackerFormat', () => {
  it('detects a real .ex file', () => {
    expect(isFashionTrackerFormat(loadAB(EX_FILE))).toBe(true);
  });

  it('rejects all-zero buffer', () => {
    expect(isFashionTrackerFormat(new ArrayBuffer(256))).toBe(false);
  });

  it('rejects buffer shorter than minimum', () => {
    expect(isFashionTrackerFormat(new ArrayBuffer(10))).toBe(false);
  });

  it('rejects buffer with wrong magic bytes', () => {
    const buf = new Uint8Array(128).fill(0x41);
    expect(isFashionTrackerFormat(buf.buffer)).toBe(false);
  });
});

// ── Parsing ────────────────────────────────────────────────────────────────

describe('parseFashionTrackerFile', () => {
  it('parses without throwing', () => {
    expect(() => parseFashionTrackerFile(loadAB(EX_FILE), 'fashionating 1.ex')).not.toThrow();
  });

  it('returns a defined TrackerSong', () => {
    const song = parseFashionTrackerFile(loadAB(EX_FILE), 'fashionating 1.ex');
    expect(song).toBeDefined();
  });

  it('returns format MOD', () => {
    const song = parseFashionTrackerFile(loadAB(EX_FILE), 'fashionating 1.ex');
    expect(song.format).toBe('MOD');
  });

  it('has 4 channels', () => {
    const song = parseFashionTrackerFile(loadAB(EX_FILE), 'fashionating 1.ex');
    expect(song.numChannels).toBe(4);
  });

  it('has at least one pattern', () => {
    const song = parseFashionTrackerFile(loadAB(EX_FILE), 'fashionating 1.ex');
    expect(song.patterns.length).toBeGreaterThanOrEqual(1);
  });

  it('has a valid song order', () => {
    const song = parseFashionTrackerFile(loadAB(EX_FILE), 'fashionating 1.ex');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has valid BPM and speed', () => {
    const song = parseFashionTrackerFile(loadAB(EX_FILE), 'fashionating 1.ex');
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('logs format report', () => {
    const song = parseFashionTrackerFile(loadAB(EX_FILE), 'fashionating 1.ex');
    const report = analyzeFormat(song, 'fashionating 1.ex');
    console.log(formatReportToString(report));
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
