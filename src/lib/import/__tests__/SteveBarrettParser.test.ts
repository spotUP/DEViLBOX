import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isSteveBarrettFormat, parseSteveBarrettFile } from '../formats/SteveBarrettParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');

const FILE1 = resolve(REF, 'Steve Barrett/Steve Barrett/advanced ski simulator.sb');
const FILE2 = resolve(REF, 'Steve Barrett/Steve Barrett/artificial dreams.sb');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isSteveBarrettFormat', () => {
  it('detects FILE1', () => {
    expect(isSteveBarrettFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects FILE2', () => {
    expect(isSteveBarrettFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isSteveBarrettFormat(new ArrayBuffer(256))).toBe(false);
  });
});

describe('parseSteveBarrettFile — advanced ski simulator.sb', () => {
  it('parses without throwing', () => {
    expect(() => parseSteveBarrettFile(loadBuf(FILE1), 'advanced ski simulator.sb')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseSteveBarrettFile(loadBuf(FILE1), 'advanced ski simulator.sb');
    const report = analyzeFormat(song, 'advanced ski simulator.sb');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseSteveBarrettFile — artificial dreams.sb', () => {
  it('parses without throwing', () => {
    expect(() => parseSteveBarrettFile(loadBuf(FILE2), 'artificial dreams.sb')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseSteveBarrettFile(loadBuf(FILE2), 'artificial dreams.sb');
    const report = analyzeFormat(song, 'artificial dreams.sb');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
