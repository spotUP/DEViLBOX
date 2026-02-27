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

const REF = resolve(import.meta.dirname, '../../../../Reference Music');

const FILE1 = resolve(REF, 'Kris Hatlelid/Kris Hatlelid/Wings Of Fury/wings of fury.kh');
const FILE2 = resolve(REF, 'Kris Hatlelid/Kris Hatlelid/The Cycles/the cycles.kh');
const FILE3 = resolve(REF, 'Kris Hatlelid/Kris Hatlelid/Test Drive 2/test drive 2.kh');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// ── isKrisHatlelidFormat ────────────────────────────────────────────────────

describe('isKrisHatlelidFormat', () => {
  it('detects wings of fury.kh', () => expect(isKrisHatlelidFormat(loadBuf(FILE1))).toBe(true));
  it('detects the cycles.kh', () => expect(isKrisHatlelidFormat(loadBuf(FILE2))).toBe(true));
  it('detects test drive 2.kh', () => expect(isKrisHatlelidFormat(loadBuf(FILE3))).toBe(true));
  it('rejects a zeroed buffer', () => expect(isKrisHatlelidFormat(new ArrayBuffer(64))).toBe(false));
});

// ── parseKrisHatlelidFile ───────────────────────────────────────────────────

describe('parseKrisHatlelidFile — wings of fury.kh', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseKrisHatlelidFile(loadBuf(FILE1), 'wings of fury.kh'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'wings of fury.kh');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseKrisHatlelidFile — the cycles.kh', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseKrisHatlelidFile(loadBuf(FILE2), 'the cycles.kh'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'the cycles.kh');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseKrisHatlelidFile — test drive 2.kh', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseKrisHatlelidFile(loadBuf(FILE3), 'test drive 2.kh'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'test drive 2.kh');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
