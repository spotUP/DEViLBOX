/**
 * FredGrayParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isFredGrayFormat, parseFredGrayFile } from '../formats/FredGrayParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FG_DIR = resolve(REF, 'Fred Gray/Fred Gray');
const FILE1 = resolve(FG_DIR, 'blacklamp.gray');
const FILE2 = resolve(FG_DIR, 'eco.gray');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isFredGrayFormat', () => {
  it('detects blacklamp.gray', () => {
    expect(isFredGrayFormat(loadBuf(FILE1), 'blacklamp.gray')).toBe(true);
  });
  it('detects eco.gray', () => {
    expect(isFredGrayFormat(loadBuf(FILE2), 'eco.gray')).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isFredGrayFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseFredGrayFile — blacklamp.gray', () => {
  it('parses without throwing', () => {
    expect(() => parseFredGrayFile(loadBuf(FILE1), 'blacklamp.gray')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseFredGrayFile(loadBuf(FILE1), 'blacklamp.gray');
    const report = analyzeFormat(song, 'blacklamp.gray');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseFredGrayFile — eco.gray', () => {
  it('parses without throwing', () => {
    expect(() => parseFredGrayFile(loadBuf(FILE2), 'eco.gray')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseFredGrayFile(loadBuf(FILE2), 'eco.gray');
    const report = analyzeFormat(song, 'eco.gray');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
