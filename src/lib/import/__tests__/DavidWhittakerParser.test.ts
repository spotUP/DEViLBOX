/**
 * DavidWhittakerParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isDavidWhittakerFormat, parseDavidWhittakerFile } from '../formats/DavidWhittakerParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const DIR = resolve(import.meta.dirname, '../../../../public/data/songs');
const FILE1 = resolve(DIR, 'formats/apb.dw');
const FILE2 = resolve(DIR, 'david-whittaker/garfield2+.dw');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isDavidWhittakerFormat', () => {
  it('detects apb.dw', () => {
    expect(isDavidWhittakerFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects garfield2+.dw', () => {
    expect(isDavidWhittakerFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isDavidWhittakerFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseDavidWhittakerFile — apb.dw', () => {
  it('parses without throwing', () => {
    expect(() => parseDavidWhittakerFile(loadBuf(FILE1), 'apb.dw')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseDavidWhittakerFile(loadBuf(FILE1), 'apb.dw');
    const report = analyzeFormat(song, 'apb.dw');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseDavidWhittakerFile — garfield2+.dw', () => {
  it('parses without throwing', () => {
    expect(() => parseDavidWhittakerFile(loadBuf(FILE2), 'garfield2+.dw')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseDavidWhittakerFile(loadBuf(FILE2), 'garfield2+.dw');
    const report = analyzeFormat(song, 'garfield2+.dw');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
