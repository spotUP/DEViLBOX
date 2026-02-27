/**
 * SonicArrangerParser Tests - Format capability analysis
 *
 * API:
 *   isSonicArrangerFormat(buffer: ArrayBuffer): boolean
 *   parseSonicArrangerFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong>
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isSonicArrangerFormat, parseSonicArrangerFile } from '../formats/SonicArrangerParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FILE1 = resolve(REF, 'Sonic Arranger/Acute/snake1.sa');
const FILE2 = resolve(REF, 'Sonic Arranger/Acute/space taxi - title.sa');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isSonicArrangerFormat', () => {
  it('detects snake1.sa', () => {
    expect(isSonicArrangerFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects space taxi - title.sa', () => {
    expect(isSonicArrangerFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isSonicArrangerFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseSonicArrangerFile — snake1.sa', () => {
  it('parses without throwing', async () => {
    await expect(
      parseSonicArrangerFile(loadBuf(FILE1), 'snake1.sa')
    ).resolves.toBeDefined();
  });

  it('reports format capabilities', async () => {
    const song = await parseSonicArrangerFile(loadBuf(FILE1), 'snake1.sa');
    if (!song) {
      console.log('Parser returned null for snake1.sa');
      return;
    }
    const report = analyzeFormat(song, 'snake1.sa');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseSonicArrangerFile — space taxi - title.sa', () => {
  it('parses without throwing', async () => {
    await expect(
      parseSonicArrangerFile(loadBuf(FILE2), 'space taxi - title.sa')
    ).resolves.toBeDefined();
  });

  it('reports format capabilities', async () => {
    const song = await parseSonicArrangerFile(loadBuf(FILE2), 'space taxi - title.sa');
    if (!song) {
      console.log('Parser returned null for space taxi - title.sa');
      return;
    }
    const report = analyzeFormat(song, 'space taxi - title.sa');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
