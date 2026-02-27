/**
 * BenDaglishParser Tests - Format capability analysis
 *
 * API:
 *   isBenDaglishFormat(buffer: ArrayBuffer, filename?: string): boolean
 *   parseBenDaglishFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong | null>
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isBenDaglishFormat, parseBenDaglishFile } from '../formats/BenDaglishParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FILE1 = resolve(REF, 'Ben Daglish/Ben Daglish/corporation.bd');
const FILE2 = resolve(REF, 'Ben Daglish/Ben Daglish/rick dangerous 2 patched.bd');
const FILE3 = resolve(REF, 'Ben Daglish/Ben Daglish/motorhead-titleandingame.bd');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isBenDaglishFormat', () => {
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
});

describe('parseBenDaglishFile — corporation.bd', () => {
  it('reports format capabilities', async () => {
    let song: Awaited<ReturnType<typeof parseBenDaglishFile>> | undefined;
    try {
      song = await parseBenDaglishFile(loadBuf(FILE1), 'corporation.bd');
    } catch (e) {
      console.log('threw:', e);
      return;
    }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'corporation.bd');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseBenDaglishFile — rick dangerous 2 patched.bd', () => {
  it('reports format capabilities', async () => {
    let song: Awaited<ReturnType<typeof parseBenDaglishFile>> | undefined;
    try {
      song = await parseBenDaglishFile(loadBuf(FILE2), 'rick dangerous 2 patched.bd');
    } catch (e) {
      console.log('threw:', e);
      return;
    }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'rick dangerous 2 patched.bd');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseBenDaglishFile — motorhead-titleandingame.bd', () => {
  it('reports format capabilities', async () => {
    let song: Awaited<ReturnType<typeof parseBenDaglishFile>> | undefined;
    try {
      song = await parseBenDaglishFile(loadBuf(FILE3), 'motorhead-titleandingame.bd');
    } catch (e) {
      console.log('threw:', e);
      return;
    }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'motorhead-titleandingame.bd');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
