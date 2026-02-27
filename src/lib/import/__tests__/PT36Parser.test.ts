/**
 * PT36Parser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isPT36Format, parsePT36File } from '../formats/PT36Parser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const DIR1 = resolve(REF, 'Pretracker/AceMan');
const DIR2 = resolve(REF, 'Pretracker/Buzzer');
const FILE1 = resolve(DIR1, 'a dream of fish.prt');
const FILE2 = resolve(DIR2, 'leavings.prt');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isPT36Format', () => {
  it('detects a dream of fish.prt', () => {
    expect(isPT36Format(loadBuf(FILE1))).toBe(true);
  });
  it('detects leavings.prt', () => {
    expect(isPT36Format(loadBuf(FILE2))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isPT36Format(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parsePT36File — a dream of fish.prt', () => {
  it('parses without throwing', async () => {
    await expect(parsePT36File(loadBuf(FILE1), 'a dream of fish.prt')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parsePT36File(loadBuf(FILE1), 'a dream of fish.prt');
    const report = analyzeFormat(song, 'a dream of fish.prt');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parsePT36File — leavings.prt', () => {
  it('parses without throwing', async () => {
    await expect(parsePT36File(loadBuf(FILE2), 'leavings.prt')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parsePT36File(loadBuf(FILE2), 'leavings.prt');
    const report = analyzeFormat(song, 'leavings.prt');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
