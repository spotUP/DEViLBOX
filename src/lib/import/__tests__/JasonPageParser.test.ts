/**
 * JasonPageParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { isJasonPageFormat, parseJasonPageFile } from '../formats/JasonPageParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
// Reference Music is a local-only corpus (gitignored, absent from a clean checkout): skip, do not fail.
const HAS_CORPUS = existsSync(REF);
const JP_DIR = resolve(REF, 'Jason Page/Jason Page');
const JP_OLD_DIR = resolve(REF, 'Jason Page Old/Jason Page');
const FILE1 = resolve(JP_DIR, 'jpn.fire and ice-1');
const FILE2 = resolve(JP_OLD_DIR, 'offroad.jpo');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe.skipIf(!HAS_CORPUS)('isJasonPageFormat', () => {
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

describe.skipIf(!HAS_CORPUS)('parseJasonPageFile — jpn.fire and ice-1', () => {
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
    // MI_MaxSamples = 32 per InfoBuffer in Jason Page_v5.s
    expect(song.instruments).toHaveLength(32);
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

describe.skipIf(!HAS_CORPUS)('parseJasonPageFile — offroad.jpo', () => {
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
