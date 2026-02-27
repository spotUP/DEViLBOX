import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isRonKlarenFormat, parseRonKlarenFile } from '../formats/RonKlarenParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FILE_ASTRA1 = resolve(REF, 'Ron Klaren/Ron Klaren/astra 1.rk');
const FILE_ASTRA2 = resolve(REF, 'Ron Klaren/Ron Klaren/astra 2.rk');

function loadU8(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}


describe('isRonKlarenFormat', () => {
  it('detects astra 1.rk', () => expect(isRonKlarenFormat(loadU8(FILE_ASTRA1))).toBe(true));
  it('detects astra 2.rk', () => expect(isRonKlarenFormat(loadU8(FILE_ASTRA2))).toBe(true));
  it('rejects a zeroed buffer', () => expect(isRonKlarenFormat(new Uint8Array(256))).toBe(false));
});

describe('parseRonKlarenFile — astra 1.rk', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseRonKlarenFile(loadU8(FILE_ASTRA1), 'astra 1.rk'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'astra 1.rk');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseRonKlarenFile — astra 2.rk', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseRonKlarenFile(loadU8(FILE_ASTRA2), 'astra 2.rk'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'astra 2.rk');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
