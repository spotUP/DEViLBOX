/**
 * JeroenTelParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isJeroenTelFormat, parseJeroenTelFile } from '../formats/JeroenTelParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const JT_DIR = resolve(REF, 'Jeroen Tel/Johannes Bjerregard');
const FILE1 = resolve(JT_DIR, 'stormlord ingame.jt');
const FILE2 = resolve(JT_DIR, 'stormlord title.jt');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isJeroenTelFormat', () => {
  it('detects stormlord ingame.jt', () => {
    expect(isJeroenTelFormat(loadBuf(FILE1), 'stormlord ingame.jt')).toBe(true);
  });
  it('detects stormlord title.jt', () => {
    expect(isJeroenTelFormat(loadBuf(FILE2), 'stormlord title.jt')).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isJeroenTelFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseJeroenTelFile — stormlord ingame.jt', () => {
  it('parses without throwing', async () => {
    await expect(parseJeroenTelFile(loadBuf(FILE1), 'stormlord ingame.jt')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseJeroenTelFile(loadBuf(FILE1), 'stormlord ingame.jt');
    const report = analyzeFormat(song, 'stormlord ingame.jt');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseJeroenTelFile — stormlord title.jt', () => {
  it('parses without throwing', async () => {
    await expect(parseJeroenTelFile(loadBuf(FILE2), 'stormlord title.jt')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseJeroenTelFile(loadBuf(FILE2), 'stormlord title.jt');
    const report = analyzeFormat(song, 'stormlord title.jt');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
