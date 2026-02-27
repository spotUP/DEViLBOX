import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isSoundMasterFormat, parseSoundMasterFile } from '../formats/SoundMasterParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');

// Sound Master (v1)
const SM_FILE = resolve(REF, 'Sound Master/- unknown/delta-rob hubbard.sm');
// Sound Master II v1
const SM2V1_FILE = resolve(REF, 'Sound Master II v1/Jeroen Soede/futureshock-gameover.smpro');
// Sound Master II v3
const SM2V3_FILE = resolve(REF, 'Sound Master II v3/Jeroen Soede/doofus 1.sm3');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isSoundMasterFormat', () => {
  it('detects Sound Master v1 (.sm)', () => {
    expect(isSoundMasterFormat(loadBuf(SM_FILE), 'delta-rob hubbard.sm')).toBe(true);
  });
  it('detects Sound Master II v1 (.smpro)', () => {
    expect(isSoundMasterFormat(loadBuf(SM2V1_FILE), 'futureshock-gameover.smpro')).toBe(true);
  });
  it('detects Sound Master II v3 (.sm3)', () => {
    expect(isSoundMasterFormat(loadBuf(SM2V3_FILE), 'doofus 1.sm3')).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isSoundMasterFormat(new ArrayBuffer(256))).toBe(false);
  });
});

describe('parseSoundMasterFile — Sound Master v1', () => {
  it('parses without throwing', async () => {
    await expect(parseSoundMasterFile(loadBuf(SM_FILE), 'delta-rob hubbard.sm')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseSoundMasterFile(loadBuf(SM_FILE), 'delta-rob hubbard.sm');
    const report = analyzeFormat(song, 'delta-rob hubbard.sm');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseSoundMasterFile — Sound Master II v1', () => {
  it('parses without throwing', async () => {
    await expect(parseSoundMasterFile(loadBuf(SM2V1_FILE), 'futureshock-gameover.smpro')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseSoundMasterFile(loadBuf(SM2V1_FILE), 'futureshock-gameover.smpro');
    const report = analyzeFormat(song, 'futureshock-gameover.smpro');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseSoundMasterFile — Sound Master II v3', () => {
  it('parses without throwing', async () => {
    await expect(parseSoundMasterFile(loadBuf(SM2V3_FILE), 'doofus 1.sm3')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseSoundMasterFile(loadBuf(SM2V3_FILE), 'doofus 1.sm3');
    const report = analyzeFormat(song, 'doofus 1.sm3');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
