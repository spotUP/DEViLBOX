/**
 * BenDaglishSIDParser Tests - Format capability analysis
 *
 * API:
 *   isBenDaglishSIDFormat(buffer: ArrayBuffer, filename?: string): boolean
 *   parseBenDaglishSIDFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong | null>
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isBenDaglishSIDFormat, parseBenDaglishSIDFile } from '../formats/BenDaglishSIDParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FILE1 = resolve(REF, 'Ben Daglish SID/Ben Daglish/chubbygristle.bds');
const FILE2 = resolve(REF, 'Ben Daglish SID/Ben Daglish/flintstones.bds');
const FILE3 = resolve(REF, 'Ben Daglish SID/Ben Daglish/terramex.bds');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isBenDaglishSIDFormat', () => {
  it('detects chubbygristle.bds', () => {
    expect(isBenDaglishSIDFormat(loadBuf(FILE1), 'chubbygristle.bds')).toBe(true);
  });
  it('detects flintstones.bds', () => {
    expect(isBenDaglishSIDFormat(loadBuf(FILE2), 'flintstones.bds')).toBe(true);
  });
  it('detects terramex.bds', () => {
    expect(isBenDaglishSIDFormat(loadBuf(FILE3), 'terramex.bds')).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isBenDaglishSIDFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseBenDaglishSIDFile — chubbygristle.bds', () => {
  it('reports format capabilities', async () => {
    let song: Awaited<ReturnType<typeof parseBenDaglishSIDFile>> | undefined;
    try {
      song = await parseBenDaglishSIDFile(loadBuf(FILE1), 'chubbygristle.bds');
    } catch (e) {
      console.log('threw:', e);
      return;
    }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'chubbygristle.bds');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseBenDaglishSIDFile — flintstones.bds', () => {
  it('reports format capabilities', async () => {
    let song: Awaited<ReturnType<typeof parseBenDaglishSIDFile>> | undefined;
    try {
      song = await parseBenDaglishSIDFile(loadBuf(FILE2), 'flintstones.bds');
    } catch (e) {
      console.log('threw:', e);
      return;
    }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'flintstones.bds');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseBenDaglishSIDFile — terramex.bds', () => {
  it('reports format capabilities', async () => {
    let song: Awaited<ReturnType<typeof parseBenDaglishSIDFile>> | undefined;
    try {
      song = await parseBenDaglishSIDFile(loadBuf(FILE3), 'terramex.bds');
    } catch (e) {
      console.log('threw:', e);
      return;
    }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'terramex.bds');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
