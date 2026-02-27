/**
 * AshleyHoggParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isAshleyHoggFormat, parseAshleyHoggFile } from '../formats/AshleyHoggParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const AH_DIR = resolve(REF, 'Ashley Hogg');
const FILE1 = resolve(AH_DIR, 'ash.cj in the usa');
const FILE2 = resolve(AH_DIR, 'ash.cosmic spacehead');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isAshleyHoggFormat', () => {
  it('detects ash.cj in the usa', () => {
    expect(isAshleyHoggFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects ash.cosmic spacehead', () => {
    expect(isAshleyHoggFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isAshleyHoggFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseAshleyHoggFile — ash.cj in the usa', () => {
  it('parses without throwing', () => {
    expect(() => parseAshleyHoggFile(loadBuf(FILE1), 'ash.cj in the usa')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseAshleyHoggFile(loadBuf(FILE1), 'ash.cj in the usa');
    const report = analyzeFormat(song, 'ash.cj in the usa');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseAshleyHoggFile — ash.cosmic spacehead', () => {
  it('parses without throwing', () => {
    expect(() => parseAshleyHoggFile(loadBuf(FILE2), 'ash.cosmic spacehead')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseAshleyHoggFile(loadBuf(FILE2), 'ash.cosmic spacehead');
    const report = analyzeFormat(song, 'ash.cosmic spacehead');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
