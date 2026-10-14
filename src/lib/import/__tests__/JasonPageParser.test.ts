/**
 * JasonPageParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isJasonPageFormat, parseJasonPageFile } from '../formats/JasonPageParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../public/data/songs');
const FILE1 = resolve(REF, 'jason-page/jpn.fire and ice-1');
const FILE2 = resolve(REF, 'formats/offroad.jpo');

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

  it('creates 32 placeholder instruments (MAX_SAMPLES)', async () => {
    const song = await parseJasonPageFile(loadBuf(FILE1), 'jpn.fire and ice-1');
    // MI_MaxSamples = 32 per InfoBuffer in Jason Page_v5.s; the length table at 0x147a holds 33 entries (capped at 32),
    // unused slots are zero-length, and every slot is kept
    expect(song.instruments).toHaveLength(32);
  });

  it('extracts the real samples that follow unused slots (companion smp.fire and ice-1)', async () => {
    const smp = new Uint8Array(readFileSync(resolve(REF, 'jason-page/smp.fire and ice-1')));
    const song = await parseJasonPageFile(loadBuf(FILE1), 'jpn.fire and ice-1', new Map([['smp.fire and ice-1', smp.buffer as ArrayBuffer]]));
    // Non-zero lengths in the table: 7004, 3386, 1556, 3306, 1288, 4x256, 3x128 = 17948 = size of the companion file
    const withPcm = song.instruments.filter(i => i.type === 'sample');
    expect(withPcm).toHaveLength(12);
  });

  it('leaves instruments unnamed (the format stores no names) and keeps every slot', async () => {
    const song = await parseJasonPageFile(loadBuf(FILE1), 'jpn.fire and ice-1');
    expect(song.instruments[0].name).toBe('');
    expect(song.instruments[31].name).toBe('');
  });

  it('has 4 channels', async () => {
    const song = await parseJasonPageFile(loadBuf(FILE1), 'jpn.fire and ice-1');
    expect(song.numChannels).toBe(4);
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
