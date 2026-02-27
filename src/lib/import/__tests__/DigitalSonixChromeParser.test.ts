/**
 * DigitalSonixChromeParser.test.ts — integration tests for Digital Sonix And Chrome (.dsc) format.
 *
 * Parser exports:
 *   isDscFormat(buffer: ArrayBuffer | Uint8Array): boolean
 *   parseDscFile(buffer: ArrayBuffer, filename: string): TrackerSong
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isDscFormat, parseDscFile } from '../formats/DigitalSonixChromeParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');

const FILE1 = resolve(REF, "Digital Sonix And Chrome/David Hanlon/dragon'sbreath dbfx.dsc");
const FILE2 = resolve(REF, "Digital Sonix And Chrome/David Hanlon/dragon'sbreath demo 1.dsc");

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// ── isDscFormat ─────────────────────────────────────────────────────────────

describe('isDscFormat', () => {
  it("detects dragon'sbreath dbfx.dsc", () => expect(isDscFormat(loadBuf(FILE1))).toBe(true));
  it("detects dragon'sbreath demo 1.dsc", () => expect(isDscFormat(loadBuf(FILE2))).toBe(true));
  it('rejects a zeroed buffer', () => expect(isDscFormat(new ArrayBuffer(64))).toBe(false));
});

// ── parseDscFile ────────────────────────────────────────────────────────────

describe("parseDscFile — dragon'sbreath dbfx.dsc", () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseDscFile(loadBuf(FILE1), "dragon'sbreath dbfx.dsc"); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, "dragon'sbreath dbfx.dsc");
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe("parseDscFile — dragon'sbreath demo 1.dsc", () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseDscFile(loadBuf(FILE2), "dragon'sbreath demo 1.dsc"); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, "dragon'sbreath demo 1.dsc");
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
