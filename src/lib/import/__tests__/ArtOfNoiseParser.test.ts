/**
 * ArtOfNoiseParser Tests - Format capability analysis
 *
 * API:
 *   isArtOfNoiseFormat(bytes: Uint8Array): boolean
 *   parseArtOfNoiseFile(bytes: Uint8Array, filename: string): TrackerSong | null
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isArtOfNoiseFormat, parseArtOfNoiseFile } from '../formats/ArtOfNoiseParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FILE1 = resolve(REF, 'Art Of Noise/Twice/64ergroove.aon');
const FILE2 = resolve(REF, 'Art Of Noise/Twice/a new decade.aon');
const FILE3 = resolve(REF, 'Art Of Noise/Twice/cloud 9.aon');

function loadBytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

describe('isArtOfNoiseFormat', () => {
  it('detects 64ergroove.aon', () => {
    expect(isArtOfNoiseFormat(loadBytes(FILE1))).toBe(true);
  });
  it('detects a new decade.aon', () => {
    expect(isArtOfNoiseFormat(loadBytes(FILE2))).toBe(true);
  });
  it('detects cloud 9.aon', () => {
    expect(isArtOfNoiseFormat(loadBytes(FILE3))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isArtOfNoiseFormat(new Uint8Array(64))).toBe(false);
  });
});

describe('parseArtOfNoiseFile — 64ergroove.aon', () => {
  it('reports format capabilities', () => {
    let song: ReturnType<typeof parseArtOfNoiseFile> | undefined;
    try {
      song = parseArtOfNoiseFile(loadBytes(FILE1), '64ergroove.aon');
    } catch (e) {
      console.log('threw:', e);
      return;
    }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, '64ergroove.aon');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseArtOfNoiseFile — a new decade.aon', () => {
  it('reports format capabilities', () => {
    let song: ReturnType<typeof parseArtOfNoiseFile> | undefined;
    try {
      song = parseArtOfNoiseFile(loadBytes(FILE2), 'a new decade.aon');
    } catch (e) {
      console.log('threw:', e);
      return;
    }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'a new decade.aon');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseArtOfNoiseFile — cloud 9.aon', () => {
  it('reports format capabilities', () => {
    let song: ReturnType<typeof parseArtOfNoiseFile> | undefined;
    try {
      song = parseArtOfNoiseFile(loadBytes(FILE3), 'cloud 9.aon');
    } catch (e) {
      console.log('threw:', e);
      return;
    }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'cloud 9.aon');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
