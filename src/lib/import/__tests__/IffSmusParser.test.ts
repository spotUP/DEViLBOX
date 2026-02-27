/**
 * IffSmusParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isIffSmusFormat, parseIffSmusFile } from '../formats/IffSmusParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const IS_DIR = resolve(REF, 'IFF-SMUS/- unknown');
const FILE1 = resolve(IS_DIR, 'alex/alex.smus');
const FILE2 = resolve(IS_DIR, 'Amanda/Amanda.smus');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isIffSmusFormat', () => {
  it('detects alex', () => {
    expect(isIffSmusFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects Amanda', () => {
    expect(isIffSmusFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isIffSmusFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseIffSmusFile — alex', () => {
  it('parses without throwing', async () => {
    await expect(parseIffSmusFile(loadBuf(FILE1), 'alex')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseIffSmusFile(loadBuf(FILE1), 'alex');
    const report = analyzeFormat(song, 'alex');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseIffSmusFile — Amanda', () => {
  it('parses without throwing', async () => {
    await expect(parseIffSmusFile(loadBuf(FILE2), 'Amanda')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseIffSmusFile(loadBuf(FILE2), 'Amanda');
    const report = analyzeFormat(song, 'Amanda');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
