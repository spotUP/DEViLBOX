/**
 * CustomMadeParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isCustomMadeFormat, parseCustomMadeFile } from '../formats/CustomMadeParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const DIR = resolve(REF, 'Delitracker Custom/Ben Daglish');
const FILE1 = resolve(DIR, 'action fighter.cus');
const FILE2 = resolve(DIR, 'terramex.cus');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isCustomMadeFormat', () => {
  it('detects action fighter.cus without filename (binary-only)', () => {
    expect(isCustomMadeFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects terramex.cus without filename (binary-only)', () => {
    expect(isCustomMadeFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isCustomMadeFormat(new ArrayBuffer(4000))).toBe(false);
  });
});

describe('parseCustomMadeFile — action fighter.cus', () => {
  it('parses without throwing', async () => {
    await expect(parseCustomMadeFile(loadBuf(FILE1), 'action fighter.cus')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseCustomMadeFile(loadBuf(FILE1), 'action fighter.cus');
    const report = analyzeFormat(song, 'action fighter.cus');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseCustomMadeFile — terramex.cus', () => {
  it('parses without throwing', async () => {
    await expect(parseCustomMadeFile(loadBuf(FILE2), 'terramex.cus')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseCustomMadeFile(loadBuf(FILE2), 'terramex.cus');
    const report = analyzeFormat(song, 'terramex.cus');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
