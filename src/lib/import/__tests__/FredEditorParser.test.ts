/**
 * FredEditorParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isFredEditorFormat, parseFredEditorFile } from '../formats/FredEditorParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FE_DIR1 = resolve(REF, 'FredMon/- unknown');
const FE_DIR2 = resolve(REF, 'FredMon/Fred');
const FILE1 = resolve(FE_DIR1, 'aspar.fred');
const FILE2 = resolve(FE_DIR2, 'ilyad title and ingame.fred');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isFredEditorFormat', () => {
  it('detects aspar.fred', () => {
    expect(isFredEditorFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects ilyad title and ingame.fred', () => {
    expect(isFredEditorFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isFredEditorFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseFredEditorFile — aspar.fred', () => {
  it('parses without throwing', async () => {
    await expect(parseFredEditorFile(loadBuf(FILE1), 'aspar.fred')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseFredEditorFile(loadBuf(FILE1), 'aspar.fred');
    const report = analyzeFormat(song, 'aspar.fred');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseFredEditorFile — ilyad title and ingame.fred', () => {
  it('parses without throwing', async () => {
    await expect(parseFredEditorFile(loadBuf(FILE2), 'ilyad title and ingame.fred')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseFredEditorFile(loadBuf(FILE2), 'ilyad title and ingame.fred');
    const report = analyzeFormat(song, 'ilyad title and ingame.fred');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
