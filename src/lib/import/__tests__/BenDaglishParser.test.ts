/**
 * BenDaglishParser Tests - Format capability analysis
 *
 * API:
 *   isBenDaglishFormat(buffer: ArrayBuffer, filename?: string): boolean
 *   parseBenDaglishFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong>
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isBenDaglishFormat, parseBenDaglishFile } from '../formats/BenDaglishParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../public/data/songs');
const FILE1 = resolve(REF, 'ben-daglish/motorhead-titleandingame.bd');
const FILE2 = resolve(REF, 'formats/mickey_mouse.bd');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isBenDaglishFormat', () => {
  it('detects motorhead-titleandingame.bd', () => {
    expect(isBenDaglishFormat(loadBuf(FILE1), 'motorhead-titleandingame.bd')).toBe(true);
  });
  it('detects mickey_mouse.bd', () => {
    expect(isBenDaglishFormat(loadBuf(FILE2), 'mickey_mouse.bd')).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isBenDaglishFormat(new ArrayBuffer(64))).toBe(false);
  });
  it('rejects a buffer that is too short', () => {
    expect(isBenDaglishFormat(new ArrayBuffer(8))).toBe(false);
  });
});

describe('parseBenDaglishFile — motorhead-titleandingame.bd', () => {
  it('reports format capabilities', async () => {
    const song = await parseBenDaglishFile(loadBuf(FILE1), 'motorhead-titleandingame.bd');
    const report = analyzeFormat(song, 'motorhead-titleandingame.bd');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });

  it('extracts one instrument per valid sample descriptor (10 in this file)', async () => {
    const song = await parseBenDaglishFile(loadBuf(FILE1), 'motorhead-titleandingame.bd');
    // Sample table at 0x12ac holds 11 longword entries; the 11th (descriptor at 0x146e) points past the end of the
    // file and is skipped, leaving 10 (walked independently from the file bytes with a throwaway script).
    expect(song.instruments).toHaveLength(10);
  });

  it('leaves instruments unnamed (the format stores no names) and keeps every slot', async () => {
    const song = await parseBenDaglishFile(loadBuf(FILE1), 'motorhead-titleandingame.bd');
    expect(song.instruments[0].name).toBe('');
    expect(song.instruments[9].name).toBe('');
  });

  it('has 4 channels', async () => {
    const song = await parseBenDaglishFile(loadBuf(FILE1), 'motorhead-titleandingame.bd');
    expect(song.numChannels).toBe(4);
  });

  it('derives module name from filename', async () => {
    const song = await parseBenDaglishFile(loadBuf(FILE1), 'motorhead-titleandingame.bd');
    // Filename "motorhead-titleandingame.bd" → strip ".bd" → "motorhead-titleandingame"
    expect(song.name).toContain('motorhead-titleandingame');
  });
});

describe('parseBenDaglishFile — mickey_mouse.bd', () => {
  it('reports format capabilities', async () => {
    const song = await parseBenDaglishFile(loadBuf(FILE2), 'mickey_mouse.bd');
    const report = analyzeFormat(song, 'mickey_mouse.bd');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseBenDaglishFile — mickey_mouse.bd', () => {
  it('extracts the 4 valid sample descriptors of its 5-entry table', async () => {
    const song = await parseBenDaglishFile(loadBuf(FILE2), 'mickey_mouse.bd');
    // Table at 0xdec: 5 entries, the 5th points past the end of the file (walked from the bytes)
    expect(song.instruments).toHaveLength(4);
  });
});
