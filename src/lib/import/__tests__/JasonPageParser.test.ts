/**
 * JasonPageParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isJasonPageFormat, parseJasonPageFile } from '../formats/JasonPageParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const JP_DIR = resolve(REF, 'Jason Page/Jason Page');
const JP_OLD_DIR = resolve(REF, 'Jason Page Old/Jason Page');
const FILE1 = resolve(JP_DIR, 'jpn.fire and ice-1');
const FILE2 = resolve(JP_OLD_DIR, 'offroad.jpo');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isJasonPageFormat', () => {
  it('detects jpn.fire and ice-1', () => {
    expect(isJasonPageFormat(loadBuf(FILE1), 'jpn.fire and ice-1')).toBe(true);
  });
  it('detects offroad.jpo', () => {
    expect(isJasonPageFormat(loadBuf(FILE2), 'offroad.jpo')).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isJasonPageFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseJasonPageFile — jpn.fire and ice-1', () => {
  it('parses without throwing', async () => {
    await expect(parseJasonPageFile(loadBuf(FILE1), 'jpn.fire and ice-1')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseJasonPageFile(loadBuf(FILE1), 'jpn.fire and ice-1');
    const report = analyzeFormat(song, 'jpn.fire and ice-1');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseJasonPageFile — offroad.jpo', () => {
  it('parses without throwing', async () => {
    await expect(parseJasonPageFile(loadBuf(FILE2), 'offroad.jpo')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseJasonPageFile(loadBuf(FILE2), 'offroad.jpo');
    const report = analyzeFormat(song, 'offroad.jpo');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
