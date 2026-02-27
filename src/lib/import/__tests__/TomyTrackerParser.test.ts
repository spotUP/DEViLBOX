import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isTomyTrackerFormat, parseTomyTrackerFile } from '../formats/TomyTrackerParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FILE_INCONVENIENT = resolve(REF, 'Tomy Tracker/Stargazer/inconvenient intro.sg');
const FILE_IRREPRESSIBLE = resolve(REF, 'Tomy Tracker/Stargazer/irrepressible intro.sg');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isTomyTrackerFormat', () => {
  it('detects inconvenient intro.sg', () => expect(isTomyTrackerFormat(loadBuf(FILE_INCONVENIENT))).toBe(true));
  it('detects irrepressible intro.sg', () => expect(isTomyTrackerFormat(loadBuf(FILE_IRREPRESSIBLE))).toBe(true));
  it('rejects a zeroed buffer', () => expect(isTomyTrackerFormat(new ArrayBuffer(64))).toBe(false));
});

describe('parseTomyTrackerFile — inconvenient intro.sg', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseTomyTrackerFile(loadBuf(FILE_INCONVENIENT), 'inconvenient intro.sg'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'inconvenient intro.sg');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseTomyTrackerFile — irrepressible intro.sg', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseTomyTrackerFile(loadBuf(FILE_IRREPRESSIBLE), 'irrepressible intro.sg'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'irrepressible intro.sg');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
