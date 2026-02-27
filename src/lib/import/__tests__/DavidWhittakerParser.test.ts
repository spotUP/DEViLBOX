/**
 * DavidWhittakerParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isDavidWhittakerFormat, parseDavidWhittakerFile } from '../formats/DavidWhittakerParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const DW_DIR = resolve(REF, 'David Whittaker/David Whittaker');
const FILE1 = resolve(DW_DIR, 'alfred chicken.dw');
const FILE2 = resolve(DW_DIR, 'alien syndrome.dw');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isDavidWhittakerFormat', () => {
  it('detects alfred chicken.dw', () => {
    expect(isDavidWhittakerFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects alien syndrome.dw', () => {
    expect(isDavidWhittakerFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isDavidWhittakerFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseDavidWhittakerFile — alfred chicken.dw', () => {
  it('parses without throwing', () => {
    expect(() => parseDavidWhittakerFile(loadBuf(FILE1), 'alfred chicken.dw')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseDavidWhittakerFile(loadBuf(FILE1), 'alfred chicken.dw');
    const report = analyzeFormat(song, 'alfred chicken.dw');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseDavidWhittakerFile — alien syndrome.dw', () => {
  it('parses without throwing', () => {
    expect(() => parseDavidWhittakerFile(loadBuf(FILE2), 'alien syndrome.dw')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseDavidWhittakerFile(loadBuf(FILE2), 'alien syndrome.dw');
    const report = analyzeFormat(song, 'alien syndrome.dw');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
