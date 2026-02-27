/**
 * DigiBoosterProParser.test.ts — integration tests for DigiBooster Pro (.dbm) format.
 *
 * Parser exports:
 *   isDigiBoosterProFormat(bytes: Uint8Array): boolean
 *   parseDigiBoosterProFile(bytes: Uint8Array, filename: string): TrackerSong | null
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isDigiBoosterProFormat, parseDigiBoosterProFile } from '../formats/DigiBoosterProParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');

const FILE1 = resolve(REF, 'Digibooster Pro/AceMan/invisibility.dbm');
const FILE2 = resolve(REF, 'Digibooster Pro/AceMan/tricky reality.dbm');

function loadBytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

// ── isDigiBoosterProFormat ──────────────────────────────────────────────────

describe('isDigiBoosterProFormat', () => {
  it('detects invisibility.dbm', () => expect(isDigiBoosterProFormat(loadBytes(FILE1))).toBe(true));
  it('detects tricky reality.dbm', () => expect(isDigiBoosterProFormat(loadBytes(FILE2))).toBe(true));
  it('rejects a zeroed buffer', () => expect(isDigiBoosterProFormat(new Uint8Array(256))).toBe(false));
});

// ── parseDigiBoosterProFile ─────────────────────────────────────────────────

describe('parseDigiBoosterProFile — invisibility.dbm', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseDigiBoosterProFile(loadBytes(FILE1), 'invisibility.dbm'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'invisibility.dbm');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseDigiBoosterProFile — tricky reality.dbm', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseDigiBoosterProFile(loadBytes(FILE2), 'tricky reality.dbm'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'tricky reality.dbm');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
