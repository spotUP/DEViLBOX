import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isSpecialFXFormat, parseSpecialFXFile } from '../formats/SpecialFXParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');

const FILE1 = resolve(REF, 'Special FX/Jonathan Dunn/battlecommand ingame.jd');
const FILE2 = resolve(REF, 'Special FX/Jonathan Dunn/battlecommand title.jd');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isSpecialFXFormat', () => {
  it('detects FILE1', () => {
    expect(isSpecialFXFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects FILE2', () => {
    expect(isSpecialFXFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isSpecialFXFormat(new ArrayBuffer(256))).toBe(false);
  });
});

describe('parseSpecialFXFile — battlecommand ingame.jd', () => {
  it('parses without throwing', () => {
    expect(() => parseSpecialFXFile(loadBuf(FILE1), 'battlecommand ingame.jd')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseSpecialFXFile(loadBuf(FILE1), 'battlecommand ingame.jd');
    const report = analyzeFormat(song, 'battlecommand ingame.jd');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseSpecialFXFile — battlecommand title.jd', () => {
  it('parses without throwing', () => {
    expect(() => parseSpecialFXFile(loadBuf(FILE2), 'battlecommand title.jd')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseSpecialFXFile(loadBuf(FILE2), 'battlecommand title.jd');
    const report = analyzeFormat(song, 'battlecommand title.jd');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
