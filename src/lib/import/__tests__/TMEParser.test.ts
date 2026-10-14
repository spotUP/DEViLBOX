/**
 * TMEParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isTMEFormat, parseTMEFile } from '../formats/TMEParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../public/data/songs');
const FILE1 = resolve(REF, 'the-musical-enlightenment/64 conversion.tme');
const FILE2 = resolve(REF, 'formats/64_conversion.tme');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isTMEFormat', () => {
  it('detects demo song.tme', () => {
    expect(isTMEFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects hawkeye.tme', () => {
    expect(isTMEFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isTMEFormat(new ArrayBuffer(8000))).toBe(false);
  });
});

describe('parseTMEFile — demo song.tme', () => {
  it('parses without throwing', () => {
    expect(() => parseTMEFile(loadBuf(FILE1), 'demo song.tme')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseTMEFile(loadBuf(FILE1), 'demo song.tme');
    const report = analyzeFormat(song, 'demo song.tme');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseTMEFile — hawkeye.tme', () => {
  it('parses without throwing', () => {
    expect(() => parseTMEFile(loadBuf(FILE2), 'hawkeye.tme')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseTMEFile(loadBuf(FILE2), 'hawkeye.tme');
    const report = analyzeFormat(song, 'hawkeye.tme');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
