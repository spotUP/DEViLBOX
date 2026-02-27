/**
 * JochenHippelSTParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isJochenHippelSTFormat, parseJochenHippelSTFile } from '../formats/JochenHippelSTParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const HIP_ST_DIR = resolve(REF, 'Hippel ST/Jochen Hippel');
const FILE1 = resolve(HIP_ST_DIR, 'astaroth.sog');
const FILE2 = resolve(HIP_ST_DIR, 'comic bakery.sog');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isJochenHippelSTFormat', () => {
  it('detects astaroth.sog', () => {
    expect(isJochenHippelSTFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects comic bakery.sog', () => {
    expect(isJochenHippelSTFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isJochenHippelSTFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseJochenHippelSTFile — astaroth.sog', () => {
  it('parses without throwing', () => {
    expect(() => parseJochenHippelSTFile(loadBuf(FILE1), 'astaroth.sog')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseJochenHippelSTFile(loadBuf(FILE1), 'astaroth.sog');
    const report = analyzeFormat(song, 'astaroth.sog');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseJochenHippelSTFile — comic bakery.sog', () => {
  it('parses without throwing', () => {
    expect(() => parseJochenHippelSTFile(loadBuf(FILE2), 'comic bakery.sog')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseJochenHippelSTFile(loadBuf(FILE2), 'comic bakery.sog');
    const report = analyzeFormat(song, 'comic bakery.sog');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
