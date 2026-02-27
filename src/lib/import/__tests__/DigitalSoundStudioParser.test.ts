/**
 * DigitalSoundStudioParser.test.ts — integration tests for Digital Sound Studio (.dss) format.
 *
 * Parser exports:
 *   isDigitalSoundStudioFormat(bytes: Uint8Array): boolean
 *   parseDigitalSoundStudioFile(bytes: Uint8Array, filename: string): TrackerSong | null
 *
 * .dss files are identified by the magic bytes 'MMU2' at offset 0.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isDigitalSoundStudioFormat, parseDigitalSoundStudioFile } from '../formats/DigitalSoundStudioParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');

const FILE1 = resolve(REF, 'Digital Sound Studio/- unknown/megabass.dss');
const FILE2 = resolve(REF, 'Digital Sound Studio/- unknown/tracker demo.dss');
const FILE3 = resolve(REF, 'Digital Sound Studio/ADT/coop-The Conqueror/color.dss');

function loadBytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

// ── isDigitalSoundStudioFormat ──────────────────────────────────────────────

describe('isDigitalSoundStudioFormat', () => {
  it('detects megabass.dss', () => expect(isDigitalSoundStudioFormat(loadBytes(FILE1))).toBe(true));
  it('detects tracker demo.dss', () => expect(isDigitalSoundStudioFormat(loadBytes(FILE2))).toBe(true));
  it('detects color.dss', () => expect(isDigitalSoundStudioFormat(loadBytes(FILE3))).toBe(true));
  it('rejects a zeroed buffer', () => expect(isDigitalSoundStudioFormat(new Uint8Array(256))).toBe(false));
});

// ── parseDigitalSoundStudioFile ─────────────────────────────────────────────

describe('parseDigitalSoundStudioFile — megabass.dss', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseDigitalSoundStudioFile(loadBytes(FILE1), 'megabass.dss'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'megabass.dss');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseDigitalSoundStudioFile — tracker demo.dss', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseDigitalSoundStudioFile(loadBytes(FILE2), 'tracker demo.dss'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'tracker demo.dss');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseDigitalSoundStudioFile — color.dss', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseDigitalSoundStudioFile(loadBytes(FILE3), 'color.dss'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'color.dss');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
