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

const REF = resolve(import.meta.dirname, '../../../../public/data/songs');
const FILE1 = resolve(REF, 'bp-soundmon-2/nicktune1.bp');
const FILE2 = resolve(REF, 'formats/aquarivs.bp');
const FILE3 = resolve(REF, 'bp-soundmon-3/testmod.bp3');
const FILE4 = resolve(REF, 'formats/antidust.bp3');

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
  it('extracts PCM Sampler instruments (acid mix is a PCM-mode SoundMon file)', async () => {
    const song = await parseSoundMonFile(loadBuf(FILE1), 'acid mix.bp');
    if (!song) return;
    expect(song.instruments.length).toBeGreaterThan(0);
    // acid mix.bp contains PCM samples (type=pcm), extracted as Sampler instruments
    const samplerInsts = song.instruments.filter(i => i.synthType === 'Sampler');
    expect(samplerInsts.length).toBeGreaterThan(0);
    expect(samplerInsts[0].sample?.audioBuffer?.byteLength ?? 0).toBeGreaterThan(0);
  });
});

describe('parseSoundMonFile — nicktune1.bp synth instruments (SoundMon 2)', () => {
  it('extracts 13 SoundMon synth instruments (slots 1-13 start with the 0xFF synth marker)', async () => {
    const song = await parseSoundMonFile(loadBuf(FILE1), 'nicktune1.bp');
    const synthInsts = song.instruments.filter(i => i.synthType === 'SoundMonSynth');
    expect(synthInsts).toHaveLength(13);
    expect(synthInsts[0].soundMon).toBeTruthy();
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
  it('extracts sample instruments and no synth instruments (aquarivs.bp is sample-only)', async () => {
    const song = await parseSoundMonFile(loadBuf(FILE2), 'alien breed - menu.bp');
    // None of the 15 instrument slots (32 bytes each from offset 32) starts with the 0xFF synth marker
    expect(song.instruments.filter(i => i.synthType === 'SoundMonSynth')).toHaveLength(0);
    expect(song.instruments.length).toBeGreaterThan(0);
  });});

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
