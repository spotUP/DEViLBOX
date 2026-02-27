/**
 * QuartetParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isQuartetFormat, parseQuartetFile } from '../formats/QuartetParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const DIR = resolve(REF, 'Quartet PSG/- unknown');
const FILE1 = resolve(DIR, 'horror zombies from crypt.sqt');
const FILE2 = resolve(DIR, 'time machine.sqt');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isQuartetFormat', () => {
  it('detects horror zombies from crypt.sqt', () => {
    expect(isQuartetFormat(loadBuf(FILE1), 'horror zombies from crypt.sqt')).toBe(true);
  });
  it('detects time machine.sqt', () => {
    expect(isQuartetFormat(loadBuf(FILE2), 'time machine.sqt')).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isQuartetFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseQuartetFile — horror zombies from crypt.sqt', () => {
  it('parses without throwing', async () => {
    await expect(parseQuartetFile(loadBuf(FILE1), 'horror zombies from crypt.sqt')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseQuartetFile(loadBuf(FILE1), 'horror zombies from crypt.sqt');
    const report = analyzeFormat(song, 'horror zombies from crypt.sqt');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseQuartetFile — time machine.sqt', () => {
  it('parses without throwing', async () => {
    await expect(parseQuartetFile(loadBuf(FILE2), 'time machine.sqt')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseQuartetFile(loadBuf(FILE2), 'time machine.sqt');
    const report = analyzeFormat(song, 'time machine.sqt');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
