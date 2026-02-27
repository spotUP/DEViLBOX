/**
 * SymphonieProParser Tests - Format capability analysis
 *
 * API:
 *   isSymphonieProFormat(bytes: Uint8Array): boolean
 *   parseSymphonieProFile(bytes: Uint8Array, filename: string): Promise<TrackerSong>
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isSymphonieProFormat, parseSymphonieProFile } from '../formats/SymphonieProParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FILE1 = resolve(REF, 'Symphonie/- unknown/acoustic modeling demo.symmod');
const FILE2 = resolve(REF, 'Symphonie/A. Seidel/2nd one on groove.symmod');

function loadBytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

describe('isSymphonieProFormat', () => {
  it('detects acoustic modeling demo.symmod', () => {
    expect(isSymphonieProFormat(loadBytes(FILE1))).toBe(true);
  });
  it('detects 2nd one on groove.symmod', () => {
    expect(isSymphonieProFormat(loadBytes(FILE2))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isSymphonieProFormat(new Uint8Array(64))).toBe(false);
  });
});

describe('parseSymphonieProFile — acoustic modeling demo.symmod', () => {
  it('parses without throwing', async () => {
    await expect(
      parseSymphonieProFile(loadBytes(FILE1), 'acoustic modeling demo.symmod')
    ).resolves.toBeDefined();
  });

  it('reports format capabilities', async () => {
    const song = await parseSymphonieProFile(loadBytes(FILE1), 'acoustic modeling demo.symmod');
    if (!song) {
      console.log('Parser returned null for acoustic modeling demo.symmod');
      return;
    }
    const report = analyzeFormat(song, 'acoustic modeling demo.symmod');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseSymphonieProFile — 2nd one on groove.symmod', () => {
  it('parses without throwing', async () => {
    await expect(
      parseSymphonieProFile(loadBytes(FILE2), '2nd one on groove.symmod')
    ).resolves.toBeDefined();
  });

  it('reports format capabilities', async () => {
    const song = await parseSymphonieProFile(loadBytes(FILE2), '2nd one on groove.symmod');
    if (!song) {
      console.log('Parser returned null for 2nd one on groove.symmod');
      return;
    }
    const report = analyzeFormat(song, '2nd one on groove.symmod');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
