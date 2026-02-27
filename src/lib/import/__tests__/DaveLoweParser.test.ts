/**
 * DaveLoweParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isDaveLoweFormat, parseDaveLoweFile } from '../formats/DaveLoweParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const DL_DIR = resolve(REF, 'Dave Lowe/Dave Lowe');
const FILE1 = resolve(DL_DIR, 'afterburner.dl');
const FILE2 = resolve(DL_DIR, 'altered beast.dl');

function loadBytes(p: string): Uint8Array {
  return new Uint8Array(readFileSync(p));
}

function loadBuf(p: string): ArrayBuffer {
  const buf = readFileSync(p);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe('isDaveLoweFormat', () => {
  it('detects afterburner.dl', () => {
    expect(isDaveLoweFormat(loadBytes(FILE1))).toBe(true);
  });
  it('detects altered beast.dl', () => {
    expect(isDaveLoweFormat(loadBytes(FILE2))).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isDaveLoweFormat(new Uint8Array(64))).toBe(false);
  });
});

describe('parseDaveLoweFile — afterburner.dl', () => {
  it('parses without throwing', async () => {
    await expect(parseDaveLoweFile(loadBuf(FILE1), 'afterburner.dl')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseDaveLoweFile(loadBuf(FILE1), 'afterburner.dl');
    const report = analyzeFormat(song, 'afterburner.dl');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseDaveLoweFile — altered beast.dl', () => {
  it('parses without throwing', async () => {
    await expect(parseDaveLoweFile(loadBuf(FILE2), 'altered beast.dl')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseDaveLoweFile(loadBuf(FILE2), 'altered beast.dl');
    const report = analyzeFormat(song, 'altered beast.dl');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
