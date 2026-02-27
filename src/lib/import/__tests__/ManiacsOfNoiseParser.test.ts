/**
 * ManiacsOfNoiseParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isManiacsOfNoiseFormat, parseManiacsOfNoiseFile } from '../formats/ManiacsOfNoiseParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const MON_DIR = resolve(REF, 'Maniacs Of Noise/Jeroen Tel');
const FILE1 = resolve(MON_DIR, 'conspiracy - cracktro.mon');
const FILE2 = resolve(MON_DIR, 'gyroscope.mon');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isManiacsOfNoiseFormat', () => {
  it('detects conspiracy - cracktro.mon', () => {
    expect(isManiacsOfNoiseFormat(loadBuf(FILE1), 'conspiracy - cracktro.mon')).toBe(true);
  });
  it('detects gyroscope.mon', () => {
    expect(isManiacsOfNoiseFormat(loadBuf(FILE2), 'gyroscope.mon')).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isManiacsOfNoiseFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseManiacsOfNoiseFile — conspiracy - cracktro.mon', () => {
  it('parses without throwing', () => {
    expect(() => parseManiacsOfNoiseFile(loadBuf(FILE1), 'conspiracy - cracktro.mon')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseManiacsOfNoiseFile(loadBuf(FILE1), 'conspiracy - cracktro.mon');
    const report = analyzeFormat(song, 'conspiracy - cracktro.mon');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseManiacsOfNoiseFile — gyroscope.mon', () => {
  it('parses without throwing', () => {
    expect(() => parseManiacsOfNoiseFile(loadBuf(FILE2), 'gyroscope.mon')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseManiacsOfNoiseFile(loadBuf(FILE2), 'gyroscope.mon');
    const report = analyzeFormat(song, 'gyroscope.mon');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
