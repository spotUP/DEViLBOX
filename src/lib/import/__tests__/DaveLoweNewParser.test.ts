/**
 * DaveLoweNewParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isDaveLoweNewFormat, parseDaveLoweNewFile } from '../formats/DaveLoweNewParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const DLN_DIR = resolve(REF, 'Dave Lowe New/Dave Lowe');
const FILE1 = resolve(DLN_DIR, 'balrog.dln');
const FILE2 = resolve(DLN_DIR, 'beneathasteelsky 01.dln');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isDaveLoweNewFormat', () => {
  it('detects balrog.dln', () => {
    expect(isDaveLoweNewFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects beneathasteelsky 01.dln', () => {
    expect(isDaveLoweNewFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isDaveLoweNewFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseDaveLoweNewFile — balrog.dln', () => {
  it('parses without throwing', () => {
    expect(() => parseDaveLoweNewFile(loadBuf(FILE1), 'balrog.dln')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseDaveLoweNewFile(loadBuf(FILE1), 'balrog.dln');
    const report = analyzeFormat(song, 'balrog.dln');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseDaveLoweNewFile — beneathasteelsky 01.dln', () => {
  it('parses without throwing', () => {
    expect(() => parseDaveLoweNewFile(loadBuf(FILE2), 'beneathasteelsky 01.dln')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseDaveLoweNewFile(loadBuf(FILE2), 'beneathasteelsky 01.dln');
    const report = analyzeFormat(song, 'beneathasteelsky 01.dln');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
