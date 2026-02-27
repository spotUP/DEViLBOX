import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isSpeedySystemFormat, parseSpeedySystemFile } from '../formats/SpeedySystemParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');

// Speedy System (.ss)
const SS_FILE = resolve(REF, 'Speedy System/Michael Winterberg/airdriver.ss');
// Speedy A1 System (.sas)
const SAS_FILE = resolve(REF, 'Speedy A1 System/Michael Winterberg/digital voyage.sas');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isSpeedySystemFormat', () => {
  it('detects Speedy System (.ss)', () => {
    expect(isSpeedySystemFormat(loadBuf(SS_FILE))).toBe(true);
  });
  it('detects Speedy A1 System (.sas)', () => {
    expect(isSpeedySystemFormat(loadBuf(SAS_FILE))).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isSpeedySystemFormat(new ArrayBuffer(256))).toBe(false);
  });
});

describe('parseSpeedySystemFile — airdriver.ss', () => {
  it('parses without throwing', async () => {
    await expect(parseSpeedySystemFile(loadBuf(SS_FILE), 'airdriver.ss')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseSpeedySystemFile(loadBuf(SS_FILE), 'airdriver.ss');
    const report = analyzeFormat(song, 'airdriver.ss');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseSpeedySystemFile — digital voyage.sas', () => {
  it('parses without throwing', async () => {
    await expect(parseSpeedySystemFile(loadBuf(SAS_FILE), 'digital voyage.sas')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseSpeedySystemFile(loadBuf(SAS_FILE), 'digital voyage.sas');
    const report = analyzeFormat(song, 'digital voyage.sas');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
