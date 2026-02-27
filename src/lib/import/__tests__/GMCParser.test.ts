/**
 * GMCParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isGMCFormat, parseGMCFile } from '../formats/GMCParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const DIR = resolve(REF, 'GlueMon/- unknown');
const FILE1 = resolve(DIR, 'bestick.glue');
const FILE2 = resolve(DIR, 'flood.glue');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isGMCFormat', () => {
  it('detects bestick.glue', () => {
    expect(isGMCFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects flood.glue', () => {
    expect(isGMCFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isGMCFormat(new ArrayBuffer(512))).toBe(false);
  });
});

describe('parseGMCFile — bestick.glue', () => {
  it('parses without throwing', async () => {
    await expect(parseGMCFile(loadBuf(FILE1), 'bestick.glue')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseGMCFile(loadBuf(FILE1), 'bestick.glue');
    const report = analyzeFormat(song, 'bestick.glue');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseGMCFile — flood.glue', () => {
  it('parses without throwing', async () => {
    await expect(parseGMCFile(loadBuf(FILE2), 'flood.glue')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseGMCFile(loadBuf(FILE2), 'flood.glue');
    const report = analyzeFormat(song, 'flood.glue');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
