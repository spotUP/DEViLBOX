/**
 * BenDaglishParser Tests - Format capability analysis
 *
 * API:
 *   isBenDaglishFormat(buffer: ArrayBuffer, filename?: string): boolean
 *   parseBenDaglishFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong>
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { isBenDaglishFormat, parseBenDaglishFile } from '../formats/BenDaglishParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
// Reference Music is a local-only corpus (gitignored, absent from a clean checkout): skip, do not fail.
const HAS_CORPUS = existsSync(REF);
const FILE1 = resolve(REF, 'Ben Daglish/Ben Daglish/corporation.bd');
const FILE2 = resolve(REF, 'Ben Daglish/Ben Daglish/rick dangerous 2 patched.bd');
const FILE3 = resolve(REF, 'Ben Daglish/Ben Daglish/motorhead-titleandingame.bd');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe.skipIf(!HAS_CORPUS)('isBenDaglishFormat', () => {
  it('detects corporation.bd', () => {
    expect(isBenDaglishFormat(loadBuf(FILE1), 'corporation.bd')).toBe(true);
  });
  it('detects rick dangerous 2 patched.bd', () => {
    expect(isBenDaglishFormat(loadBuf(FILE2), 'rick dangerous 2 patched.bd')).toBe(true);
  });
  it('detects motorhead-titleandingame.bd', () => {
    expect(isBenDaglishFormat(loadBuf(FILE3), 'motorhead-titleandingame.bd')).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isBenDaglishFormat(new ArrayBuffer(64))).toBe(false);
  });
  it('rejects a buffer that is too short', () => {
    expect(isBenDaglishFormat(new ArrayBuffer(8))).toBe(false);
  });
});

describe.skipIf(!HAS_CORPUS)('parseBenDaglishFile — corporation.bd', () => {
  it('reports format capabilities', async () => {
    const song = await parseBenDaglishFile(loadBuf(FILE1), 'corporation.bd');
    const report = analyzeFormat(song, 'corporation.bd');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });

  it('creates 8 placeholder instruments', async () => {
    const song = await parseBenDaglishFile(loadBuf(FILE1), 'corporation.bd');
    // MI_MaxSamples not declared in InfoBuffer; 8 is the default
    expect(song.instruments).toHaveLength(8);
  });

  it('leaves instruments unnamed (the format stores no names) and keeps every slot', async () => {
    const song = await parseBenDaglishFile(loadBuf(FILE1), 'corporation.bd');
    expect(song.instruments[0].name).toBe('');
    expect(song.instruments[7].name).toBe('');
  });

  it('has 4 channels', async () => {
    const song = await parseBenDaglishFile(loadBuf(FILE1), 'corporation.bd');
    expect(song.numChannels).toBe(4);
  });

  it('derives module name from filename', async () => {
    const song = await parseBenDaglishFile(loadBuf(FILE1), 'corporation.bd');
    // Filename "corporation.bd" → strip ".bd" → "corporation"
    expect(song.name).toContain('corporation');
  });
});

describe.skipIf(!HAS_CORPUS)('parseBenDaglishFile — rick dangerous 2 patched.bd', () => {
  it('reports format capabilities', async () => {
    const song = await parseBenDaglishFile(loadBuf(FILE2), 'rick dangerous 2 patched.bd');
    const report = analyzeFormat(song, 'rick dangerous 2 patched.bd');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe.skipIf(!HAS_CORPUS)('parseBenDaglishFile — motorhead-titleandingame.bd', () => {
  it('reports format capabilities', async () => {
    const song = await parseBenDaglishFile(loadBuf(FILE3), 'motorhead-titleandingame.bd');
    const report = analyzeFormat(song, 'motorhead-titleandingame.bd');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
