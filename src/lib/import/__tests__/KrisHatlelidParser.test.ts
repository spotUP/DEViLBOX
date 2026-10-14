/**
 * KrisHatlelidParser.test.ts — integration tests for Kris Hatlelid format.
 *
 * Parser exports:
 *   isKrisHatlelidFormat(buffer: ArrayBuffer | Uint8Array): boolean
 *   parseKrisHatlelidFile(buffer: ArrayBuffer, filename: string): TrackerSong
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isKrisHatlelidFormat, parseKrisHatlelidFile } from '../formats/KrisHatlelidParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../public/data/songs');

const FILE1 = resolve(REF, 'kris-hatlelid/fiendish freddys - songs.kh');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// ── isKrisHatlelidFormat ────────────────────────────────────────────────────

describe('isKrisHatlelidFormat', () => {
  it('detects fiendish freddys - songs.kh', () => expect(isKrisHatlelidFormat(loadBuf(FILE1))).toBe(true));
  it('rejects a zeroed buffer', () => expect(isKrisHatlelidFormat(new ArrayBuffer(64))).toBe(false));
});

// ── parseKrisHatlelidFile ───────────────────────────────────────────────────

describe('parseKrisHatlelidFile — fiendish freddys - songs.kh', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseKrisHatlelidFile(loadBuf(FILE1), 'fiendish freddys - songs.kh'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'fiendish freddys - songs.kh');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
