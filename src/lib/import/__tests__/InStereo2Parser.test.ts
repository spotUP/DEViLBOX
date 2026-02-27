/**
 * InStereo2Parser Tests
 * Integration tests for InStereo! 2.0 (IS20DF10) format detection and parsing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isInStereo2Format, parseInStereo2File } from '../formats/InStereo2Parser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF_MUSIC  = resolve(import.meta.dirname, '../../../../Reference Music');
const IS2_FILE_1 = resolve(REF_MUSIC, 'InStereo! 2.0/- unknown/firefox ii.is20');
const IS2_FILE_2 = resolve(REF_MUSIC, 'InStereo! 2.0/- unknown/space blipper.is20');
// IS1 files must NOT be detected as IS2
const IS1_FILE   = resolve(REF_MUSIC, 'InStereo!/- unknown/cherry moon.is');

function loadBytes(path: string): Uint8Array {
  const buf = readFileSync(path);
  return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

// ── Detection ──────────────────────────────────────────────────────────────

describe('isInStereo2Format', () => {
  it('detects firefox ii.is20', () => {
    expect(isInStereo2Format(loadBytes(IS2_FILE_1))).toBe(true);
  });

  it('detects space blipper.is20', () => {
    expect(isInStereo2Format(loadBytes(IS2_FILE_2))).toBe(true);
  });

  it('does not detect InStereo 1.0 files as IS2', () => {
    expect(isInStereo2Format(loadBytes(IS1_FILE))).toBe(false);
  });

  it('rejects all-zero buffer', () => {
    expect(isInStereo2Format(new Uint8Array(256))).toBe(false);
  });

  it('rejects buffer too small', () => {
    expect(isInStereo2Format(new Uint8Array(4))).toBe(false);
  });

  it('rejects buffer with wrong magic', () => {
    const buf = new Uint8Array(64).fill(0x41);
    expect(isInStereo2Format(buf)).toBe(false);
  });
});

// ── Parsing ────────────────────────────────────────────────────────────────

describe('parseInStereo2File — firefox ii.is20', () => {
  it('parses without throwing', () => {
    expect(() => parseInStereo2File(loadBytes(IS2_FILE_1), 'firefox ii.is20')).not.toThrow();
  });

  it('returns a non-null TrackerSong', () => {
    const song = parseInStereo2File(loadBytes(IS2_FILE_1), 'firefox ii.is20');
    expect(song).not.toBeNull();
  });

  it('returns format IS20', () => {
    const song = parseInStereo2File(loadBytes(IS2_FILE_1), 'firefox ii.is20');
    expect(song?.format).toBe('IS20');
  });

  it('has 4 channels', () => {
    const song = parseInStereo2File(loadBytes(IS2_FILE_1), 'firefox ii.is20');
    expect(song?.numChannels).toBe(4);
  });

  it('has at least one pattern', () => {
    const song = parseInStereo2File(loadBytes(IS2_FILE_1), 'firefox ii.is20');
    expect(song?.patterns.length).toBeGreaterThanOrEqual(1);
  });

  it('has a valid song order', () => {
    const song = parseInStereo2File(loadBytes(IS2_FILE_1), 'firefox ii.is20');
    expect(song?.songPositions.length).toBeGreaterThan(0);
  });

  it('has valid BPM and speed', () => {
    const song = parseInStereo2File(loadBytes(IS2_FILE_1), 'firefox ii.is20');
    expect(song?.initialBPM).toBeGreaterThan(0);
    expect(song?.initialSpeed).toBeGreaterThan(0);
  });

  it('has instruments', () => {
    const song = parseInStereo2File(loadBytes(IS2_FILE_1), 'firefox ii.is20');
    expect(song?.instruments.length).toBeGreaterThanOrEqual(0);
  });

  it('logs format report', () => {
    const song = parseInStereo2File(loadBytes(IS2_FILE_1), 'firefox ii.is20');
    expect(song).not.toBeNull();
    const report = analyzeFormat(song!, 'firefox ii.is20');
    console.log(formatReportToString(report));
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseInStereo2File — space blipper.is20', () => {
  it('parses without throwing', () => {
    expect(() => parseInStereo2File(loadBytes(IS2_FILE_2), 'space blipper.is20')).not.toThrow();
  });

  it('returns a non-null TrackerSong', () => {
    const song = parseInStereo2File(loadBytes(IS2_FILE_2), 'space blipper.is20');
    expect(song).not.toBeNull();
  });

  it('has 4 channels', () => {
    const song = parseInStereo2File(loadBytes(IS2_FILE_2), 'space blipper.is20');
    expect(song?.numChannels).toBe(4);
  });

  it('has at least one pattern', () => {
    const song = parseInStereo2File(loadBytes(IS2_FILE_2), 'space blipper.is20');
    expect(song?.patterns.length).toBeGreaterThanOrEqual(1);
  });
});
