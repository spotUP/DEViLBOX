/**
 * DigitalMugicianParser Tests - Format capability analysis
 *
 * API:
 *   isDigitalMugicianFormat(buffer: ArrayBuffer): boolean
 *   parseDigitalMugicianFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong>
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isDigitalMugicianFormat, parseDigitalMugicianFile } from '../formats/DigitalMugicianParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FILE1 = resolve(REF, 'Digital Mugician/- unknown/editorsong.dmu');
const FILE2 = resolve(REF, 'Digital Mugician/- unknown/flight.dmu');
const FILE3 = resolve(REF, 'Digital Mugician 2/- unknown/snickle.mug');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isDigitalMugicianFormat', () => {
  it('detects editorsong.dmu', () => {
    expect(isDigitalMugicianFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects flight.dmu', () => {
    expect(isDigitalMugicianFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isDigitalMugicianFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseDigitalMugicianFile — editorsong.dmu', () => {
  it('parses without throwing', async () => {
    await expect(
      parseDigitalMugicianFile(loadBuf(FILE1), 'editorsong.dmu')
    ).resolves.toBeDefined();
  });

  it('reports format capabilities', async () => {
    const song = await parseDigitalMugicianFile(loadBuf(FILE1), 'editorsong.dmu');
    if (!song) {
      console.log('Parser returned null for editorsong.dmu');
      return;
    }
    const report = analyzeFormat(song, 'editorsong.dmu');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });

  it('extracts DigMug synth instruments', async () => {
    const song = await parseDigitalMugicianFile(loadBuf(FILE1), 'editorsong.dmu');
    if (!song) return;
    expect(song.instruments.length).toBeGreaterThan(0);
    expect(song.instruments[0].synthType).toBe('DigMugSynth');
    expect(song.instruments[0].digMug).toBeTruthy();
  });
});

describe('parseDigitalMugicianFile — flight.dmu', () => {
  it('parses without throwing', async () => {
    await expect(
      parseDigitalMugicianFile(loadBuf(FILE2), 'flight.dmu')
    ).resolves.toBeDefined();
  });

  it('reports format capabilities', async () => {
    const song = await parseDigitalMugicianFile(loadBuf(FILE2), 'flight.dmu');
    if (!song) {
      console.log('Parser returned null for flight.dmu');
      return;
    }
    const report = analyzeFormat(song, 'flight.dmu');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseDigitalMugicianFile — snickle.mug (Digital Mugician 2)', () => {
  it('parses without throwing', async () => {
    await expect(
      parseDigitalMugicianFile(loadBuf(FILE3), 'snickle.mug')
    ).resolves.toBeDefined();
  });

  it('reports format capabilities', async () => {
    const song = await parseDigitalMugicianFile(loadBuf(FILE3), 'snickle.mug');
    if (!song) {
      console.log('Parser returned null for snickle.mug');
      return;
    }
    const report = analyzeFormat(song, 'snickle.mug');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
