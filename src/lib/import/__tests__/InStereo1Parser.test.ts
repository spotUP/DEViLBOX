/**
 * InStereo1Parser Tests
 * Integration tests for InStereo! 1.0 (ISM!V1.2) format detection and parsing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isInStereo1Format, parseInStereo1File } from '../formats/InStereo1Parser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF_MUSIC = resolve(import.meta.dirname, '../../../../Reference Music');
// .is files in the InStereo! 1.0 directory
const IS1_FILE_1 = resolve(REF_MUSIC, 'InStereo!/- unknown/cherry moon.is');
const IS1_FILE_2 = resolve(REF_MUSIC, 'InStereo!/- unknown/digital man.is');

function loadBytes(path: string): Uint8Array {
  const buf = readFileSync(path);
  return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

// ── Detection ──────────────────────────────────────────────────────────────

describe('isInStereo1Format', () => {
  it('detects cherry moon.is as InStereo 1.0 format', () => {
    expect(isInStereo1Format(loadBytes(IS1_FILE_1))).toBe(true);
  });

  it('detects digital man.is as InStereo 1.0 format', () => {
    expect(isInStereo1Format(loadBytes(IS1_FILE_2))).toBe(true);
  });

  it('rejects all-zero buffer', () => {
    expect(isInStereo1Format(new Uint8Array(256))).toBe(false);
  });

  it('rejects buffer too small', () => {
    expect(isInStereo1Format(new Uint8Array(10))).toBe(false);
  });

  it('rejects buffer with wrong magic', () => {
    const buf = new Uint8Array(256).fill(0x41);
    expect(isInStereo1Format(buf)).toBe(false);
  });
});

// ── Parsing ────────────────────────────────────────────────────────────────

describe('parseInStereo1File — cherry moon.is', () => {
  it('parses without throwing', () => {
    expect(() => parseInStereo1File(loadBytes(IS1_FILE_1), 'cherry moon.is')).not.toThrow();
  });

  it('returns a non-null TrackerSong', () => {
    const song = parseInStereo1File(loadBytes(IS1_FILE_1), 'cherry moon.is');
    expect(song).not.toBeNull();
  });

  it('returns format IS10', () => {
    const song = parseInStereo1File(loadBytes(IS1_FILE_1), 'cherry moon.is');
    expect(song?.format).toBe('IS10');
  });

  it('has 4 channels', () => {
    const song = parseInStereo1File(loadBytes(IS1_FILE_1), 'cherry moon.is');
    expect(song?.numChannels).toBe(4);
  });

  it('has at least one pattern', () => {
    const song = parseInStereo1File(loadBytes(IS1_FILE_1), 'cherry moon.is');
    expect(song?.patterns.length).toBeGreaterThanOrEqual(1);
  });

  it('has a valid song order', () => {
    const song = parseInStereo1File(loadBytes(IS1_FILE_1), 'cherry moon.is');
    expect(song?.songPositions.length).toBeGreaterThan(0);
  });

  it('has valid BPM and speed', () => {
    const song = parseInStereo1File(loadBytes(IS1_FILE_1), 'cherry moon.is');
    expect(song?.initialBPM).toBeGreaterThan(0);
    expect(song?.initialSpeed).toBeGreaterThan(0);
  });

  it('has instruments', () => {
    const song = parseInStereo1File(loadBytes(IS1_FILE_1), 'cherry moon.is');
    expect(song?.instruments.length).toBeGreaterThanOrEqual(0);
  });

  it('logs format report', () => {
    const song = parseInStereo1File(loadBytes(IS1_FILE_1), 'cherry moon.is');
    expect(song).not.toBeNull();
    const report = analyzeFormat(song!, 'cherry moon.is');
    console.log(formatReportToString(report));
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseInStereo1File — digital man.is', () => {
  it('parses without throwing', () => {
    expect(() => parseInStereo1File(loadBytes(IS1_FILE_2), 'digital man.is')).not.toThrow();
  });

  it('returns a non-null TrackerSong', () => {
    const song = parseInStereo1File(loadBytes(IS1_FILE_2), 'digital man.is');
    expect(song).not.toBeNull();
  });

  it('has 4 channels', () => {
    const song = parseInStereo1File(loadBytes(IS1_FILE_2), 'digital man.is');
    expect(song?.numChannels).toBe(4);
  });
});
