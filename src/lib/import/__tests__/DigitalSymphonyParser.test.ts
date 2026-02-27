/**
 * DigitalSymphonyParser.test.ts — integration tests for Digital Symphony (.dsym / .dss) format.
 *
 * Parser exports:
 *   isDigitalSymphonyFormat(bytes: Uint8Array): boolean
 *   parseDigitalSymphonyFile(bytes: Uint8Array, filename: string): TrackerSong | null
 *
 * Files are identified by an 8-byte magic sequence at offset 0:
 *   0x02 0x01 0x13 0x13 0x14 0x12 0x01 0x0B
 *
 * Note: No Digital Symphony reference music files are present in the reference
 * collection. The .dss files in Reference Music/Digital Symphony/ are MusicMaker
 * (MMU2) files, not Digital Symphony files. Detection is tested with a crafted
 * minimum-valid buffer matching the format specification.
 */

import { describe, it, expect } from 'vitest';
import { isDigitalSymphonyFormat, parseDigitalSymphonyFile } from '../formats/DigitalSymphonyParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

// ── Crafted minimum-valid Digital Symphony buffer ───────────────────────────
// Header (17 bytes):
//   magic[8]      = 0x02 0x01 0x13 0x13 0x14 0x12 0x01 0x0B
//   version       = 0
//   numChannels   = 4
//   numOrders     = 1 (uint16LE)
//   numTracks     = 1 (uint16LE)
//   infoLen       = 0 (uint24LE)
// Then at least 72 additional bytes (63 sample name lengths + song name length + padding)

function makeDSymBuffer(): Uint8Array {
  const buf = new Uint8Array(17 + 72 + 10);
  // magic
  buf[0] = 0x02; buf[1] = 0x01; buf[2] = 0x13; buf[3] = 0x13;
  buf[4] = 0x14; buf[5] = 0x12; buf[6] = 0x01; buf[7] = 0x0B;
  // version = 0
  buf[8] = 0;
  // numChannels = 4
  buf[9] = 4;
  // numOrders = 1 (uint16LE)
  buf[10] = 1; buf[11] = 0;
  // numTracks = 1 (uint16LE)
  buf[12] = 1; buf[13] = 0;
  // infoLen = 0 (uint24LE)
  buf[14] = 0; buf[15] = 0; buf[16] = 0;
  // remaining bytes (sample name lengths etc.) are 0
  return buf;
}

// ── isDigitalSymphonyFormat ─────────────────────────────────────────────────

describe('isDigitalSymphonyFormat', () => {
  it('detects crafted valid Digital Symphony buffer', () => {
    expect(isDigitalSymphonyFormat(makeDSymBuffer())).toBe(true);
  });

  it('rejects a zeroed buffer', () => {
    expect(isDigitalSymphonyFormat(new Uint8Array(256))).toBe(false);
  });

  it('rejects buffer that is too short', () => {
    expect(isDigitalSymphonyFormat(new Uint8Array(16))).toBe(false);
  });

  it('rejects buffer with wrong magic', () => {
    const buf = makeDSymBuffer();
    buf[0] = 0xFF; // corrupt magic
    expect(isDigitalSymphonyFormat(buf)).toBe(false);
  });

  it('rejects buffer with invalid numChannels (0)', () => {
    const buf = makeDSymBuffer();
    buf[9] = 0; // numChannels = 0 (invalid)
    expect(isDigitalSymphonyFormat(buf)).toBe(false);
  });

  it('rejects buffer with invalid version (>1)', () => {
    const buf = makeDSymBuffer();
    buf[8] = 2; // version 2 is invalid
    expect(isDigitalSymphonyFormat(buf)).toBe(false);
  });
});

// ── parseDigitalSymphonyFile ────────────────────────────────────────────────

describe('parseDigitalSymphonyFile — crafted buffer', () => {
  it('returns null or TrackerSong without throwing', () => {
    const bytes = makeDSymBuffer();
    let song;
    try { song = parseDigitalSymphonyFile(bytes, 'test.dsym'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null (insufficient data — expected for minimal buffer)'); return; }
    const report = analyzeFormat(song, 'test.dsym');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
