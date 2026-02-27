/**
 * SoundFXParser Tests - Format capability analysis
 *
 * API:
 *   isSoundFXFormat(buffer: ArrayBuffer): boolean
 *   parseSoundFXFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong>
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isSoundFXFormat, parseSoundFXFile } from '../formats/SoundFXParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FILE1 = resolve(REF, 'SoundFX/- unknown/acid housemix.sfx');
const FILE2 = resolve(REF, 'SoundFX/Allister Brimble/heavy-metal.sfx');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isSoundFXFormat', () => {
  it('detects acid housemix.sfx', () => {
    expect(isSoundFXFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects heavy-metal.sfx', () => {
    expect(isSoundFXFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isSoundFXFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseSoundFXFile — acid housemix.sfx', () => {
  it('parses without throwing', async () => {
    await expect(
      parseSoundFXFile(loadBuf(FILE1), 'acid housemix.sfx')
    ).resolves.toBeDefined();
  });

  it('reports format capabilities', async () => {
    const song = await parseSoundFXFile(loadBuf(FILE1), 'acid housemix.sfx');
    if (!song) {
      console.log('Parser returned null for acid housemix.sfx');
      return;
    }
    const report = analyzeFormat(song, 'acid housemix.sfx');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });

});

describe('parseSoundFXFile — heavy-metal.sfx', () => {
  it('parses without throwing', async () => {
    await expect(
      parseSoundFXFile(loadBuf(FILE2), 'heavy-metal.sfx')
    ).resolves.toBeDefined();
  });

  it('reports format capabilities', async () => {
    const song = await parseSoundFXFile(loadBuf(FILE2), 'heavy-metal.sfx');
    if (!song) {
      console.log('Parser returned null for heavy-metal.sfx');
      return;
    }
    const report = analyzeFormat(song, 'heavy-metal.sfx');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });

  it('extracts PCM Sampler instruments', async () => {
    const song = await parseSoundFXFile(loadBuf(FILE2), 'heavy-metal.sfx');
    if (!song) return;
    expect(song.instruments.length).toBeGreaterThan(0);
    const samplerInsts = song.instruments.filter(i => i.synthType === 'Sampler');
    expect(samplerInsts.length).toBeGreaterThan(0);
    expect(samplerInsts[0].sample?.audioBuffer?.byteLength ?? 0).toBeGreaterThan(0);
  });
});
