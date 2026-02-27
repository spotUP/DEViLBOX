import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isSoundControlFormat, parseSoundControlFile } from '../formats/SoundControlParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');

const FILE1 = resolve(REF, 'SoundControl/Allan Pedersen/north sea inferno ongame1.sc');
const FILE2 = resolve(REF, 'SoundControl/Holger Gehrmann/biing-bfanf.sc');

function loadBytes(p: string): Uint8Array {
  return new Uint8Array(readFileSync(p));
}

describe('isSoundControlFormat', () => {
  it('detects FILE1', () => {
    expect(isSoundControlFormat(loadBytes(FILE1))).toBe(true);
  });
  it('detects FILE2', () => {
    expect(isSoundControlFormat(loadBytes(FILE2))).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isSoundControlFormat(new Uint8Array(256))).toBe(false);
  });
});

describe('parseSoundControlFile — north sea inferno ongame1.sc', () => {
  it('parses without returning null', () => {
    expect(parseSoundControlFile(loadBytes(FILE1), 'north sea inferno ongame1.sc')).not.toBeNull();
  });
  it('reports format capabilities', () => {
    const song = parseSoundControlFile(loadBytes(FILE1), 'north sea inferno ongame1.sc');
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'north sea inferno ongame1.sc');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseSoundControlFile — biing-bfanf.sc', () => {
  it('parses without returning null', () => {
    expect(parseSoundControlFile(loadBytes(FILE2), 'biing-bfanf.sc')).not.toBeNull();
  });
  it('reports format capabilities', () => {
    const song = parseSoundControlFile(loadBytes(FILE2), 'biing-bfanf.sc');
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'biing-bfanf.sc');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
