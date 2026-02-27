/**
 * STKParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isSTKFormat, parseSTKFile } from '../formats/STKParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const DIR1 = resolve(REF, 'Stonetracker/Bosco');
const DIR2 = resolve(REF, 'Stonetracker/Federal Robotics');
const FILE1 = resolve(DIR1, 'teinteremix22.sps');
const FILE2 = resolve(DIR2, 'antarctica.sps');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isSTKFormat', () => {
  it('detects teinteremix22.sps', () => {
    expect(isSTKFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects antarctica.sps', () => {
    expect(isSTKFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isSTKFormat(new ArrayBuffer(2048))).toBe(false);
  });
});

describe('parseSTKFile — teinteremix22.sps', () => {
  it('parses without throwing', async () => {
    await expect(parseSTKFile(loadBuf(FILE1), 'teinteremix22.sps')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseSTKFile(loadBuf(FILE1), 'teinteremix22.sps');
    const report = analyzeFormat(song, 'teinteremix22.sps');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseSTKFile — antarctica.sps', () => {
  it('parses without throwing', async () => {
    await expect(parseSTKFile(loadBuf(FILE2), 'antarctica.sps')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseSTKFile(loadBuf(FILE2), 'antarctica.sps');
    const report = analyzeFormat(song, 'antarctica.sps');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
