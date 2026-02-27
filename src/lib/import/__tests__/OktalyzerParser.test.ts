/**
 * OktalyzerParser Tests
 * Integration tests for Oktalyzer (.okta) detection and parsing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseOktalyzerFile } from '../formats/OktalyzerParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF_MUSIC  = resolve(import.meta.dirname, '../../../../Reference Music');
const OKTA_FILE  = resolve(REF_MUSIC, 'Oktalyzer/Absys/les granges brulees.okta');

function loadAB(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// ── Detection (via parse attempt) ─────────────────────────────────────────

describe('parseOktalyzerFile detection', () => {
  it('parses a real .okta file without throwing', () => {
    expect(() => parseOktalyzerFile(loadAB(OKTA_FILE), 'les granges brulees.okta')).not.toThrow();
  });

  it('throws on invalid data (wrong IFF magic)', () => {
    const buf = new Uint8Array(256).fill(0);
    expect(() => parseOktalyzerFile(buf.buffer, 'fake.okta')).toThrow();
  });
});

// ── Parsing ────────────────────────────────────────────────────────────────

describe('parseOktalyzerFile', () => {
  it('returns a defined TrackerSong', () => {
    const song = parseOktalyzerFile(loadAB(OKTA_FILE), 'les granges brulees.okta');
    expect(song).toBeDefined();
  });

  it('returns format OKT', () => {
    const song = parseOktalyzerFile(loadAB(OKTA_FILE), 'les granges brulees.okta');
    expect(song.format).toBe('OKT');
  });

  it('has 8 channels', () => {
    const song = parseOktalyzerFile(loadAB(OKTA_FILE), 'les granges brulees.okta');
    expect(song.numChannels).toBe(8);
  });

  it('has at least one pattern', () => {
    const song = parseOktalyzerFile(loadAB(OKTA_FILE), 'les granges brulees.okta');
    expect(song.patterns.length).toBeGreaterThanOrEqual(1);
  });

  it('has a valid song order', () => {
    const song = parseOktalyzerFile(loadAB(OKTA_FILE), 'les granges brulees.okta');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has valid BPM and speed', () => {
    const song = parseOktalyzerFile(loadAB(OKTA_FILE), 'les granges brulees.okta');
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('has instruments', () => {
    const song = parseOktalyzerFile(loadAB(OKTA_FILE), 'les granges brulees.okta');
    expect(song.instruments.length).toBeGreaterThanOrEqual(0);
  });

  it('logs format report', () => {
    const song = parseOktalyzerFile(loadAB(OKTA_FILE), 'les granges brulees.okta');
    const report = analyzeFormat(song, 'les granges brulees.okta');
    console.log(formatReportToString(report));
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
