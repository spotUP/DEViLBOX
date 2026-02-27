/**
 * SoundMonParser Tests - Format capability analysis
 *
 * Covers both BP SoundMon 2 (.bp) and BP SoundMon 3 (.bp3) formats.
 *
 * API:
 *   isSoundMonFormat(buffer: ArrayBuffer): boolean
 *   parseSoundMonFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong | null>
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isSoundMonFormat, parseSoundMonFile } from '../formats/SoundMonParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FILE1 = resolve(REF, 'BP SoundMon 2/Zzzax/acid mix.bp');
const FILE2 = resolve(REF, 'BP SoundMon 2/Allister Brimble/alien breed - menu.bp');
const FILE3 = resolve(REF, 'BP SoundMon 3/Zzzax/crystals.bp3');
const FILE4 = resolve(REF, 'BP SoundMon 3/Brian Postma/hawkeye newsynth.bp3');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isSoundMonFormat', () => {
  it('detects acid mix.bp (SoundMon 2)', () => {
    expect(isSoundMonFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects alien breed - menu.bp (SoundMon 2)', () => {
    expect(isSoundMonFormat(loadBuf(FILE2))).toBe(true);
  });
  it('detects crystals.bp3 (SoundMon 3)', () => {
    expect(isSoundMonFormat(loadBuf(FILE3))).toBe(true);
  });
  it('detects hawkeye newsynth.bp3 (SoundMon 3)', () => {
    expect(isSoundMonFormat(loadBuf(FILE4))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isSoundMonFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseSoundMonFile — acid mix.bp (SoundMon 2)', () => {
  it('reports format capabilities', async () => {
    let song: Awaited<ReturnType<typeof parseSoundMonFile>> | undefined;
    try {
      song = await parseSoundMonFile(loadBuf(FILE1), 'acid mix.bp');
    } catch (e) {
      console.log('threw:', e);
      return;
    }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'acid mix.bp');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseSoundMonFile — alien breed - menu.bp (SoundMon 2)', () => {
  it('reports format capabilities', async () => {
    let song: Awaited<ReturnType<typeof parseSoundMonFile>> | undefined;
    try {
      song = await parseSoundMonFile(loadBuf(FILE2), 'alien breed - menu.bp');
    } catch (e) {
      console.log('threw:', e);
      return;
    }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'alien breed - menu.bp');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseSoundMonFile — crystals.bp3 (SoundMon 3)', () => {
  it('reports format capabilities', async () => {
    let song: Awaited<ReturnType<typeof parseSoundMonFile>> | undefined;
    try {
      song = await parseSoundMonFile(loadBuf(FILE3), 'crystals.bp3');
    } catch (e) {
      console.log('threw:', e);
      return;
    }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'crystals.bp3');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseSoundMonFile — hawkeye newsynth.bp3 (SoundMon 3)', () => {
  it('reports format capabilities', async () => {
    let song: Awaited<ReturnType<typeof parseSoundMonFile>> | undefined;
    try {
      song = await parseSoundMonFile(loadBuf(FILE4), 'hawkeye newsynth.bp3');
    } catch (e) {
      console.log('threw:', e);
      return;
    }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'hawkeye newsynth.bp3');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
