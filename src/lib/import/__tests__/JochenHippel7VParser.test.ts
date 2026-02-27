/**
 * JochenHippel7VParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isJochenHippel7VFormat, parseJochenHippel7VFile } from '../formats/JochenHippel7VParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const HIP7V_DIR = resolve(REF, 'Hippel 7V/Jochen Hippel');
const FILE1 = resolve(HIP7V_DIR, 'amberstar-extro.hip7');
const FILE2 = resolve(HIP7V_DIR, 'amberstar-intro.hip7');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isJochenHippel7VFormat', () => {
  it('detects amberstar-extro.hip7', () => {
    expect(isJochenHippel7VFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects amberstar-intro.hip7', () => {
    expect(isJochenHippel7VFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isJochenHippel7VFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseJochenHippel7VFile — amberstar-extro.hip7', () => {
  it('parses without throwing', () => {
    expect(() => parseJochenHippel7VFile(loadBuf(FILE1), 'amberstar-extro.hip7')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseJochenHippel7VFile(loadBuf(FILE1), 'amberstar-extro.hip7');
    const report = analyzeFormat(song, 'amberstar-extro.hip7');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseJochenHippel7VFile — amberstar-intro.hip7', () => {
  it('parses without throwing', () => {
    expect(() => parseJochenHippel7VFile(loadBuf(FILE2), 'amberstar-intro.hip7')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseJochenHippel7VFile(loadBuf(FILE2), 'amberstar-intro.hip7');
    const report = analyzeFormat(song, 'amberstar-intro.hip7');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
