/**
 * QuadraComposerParser Tests - Format capability analysis
 *
 * API:
 *   isQuadraComposerFormat(buffer: ArrayBuffer): boolean
 *   parseQuadraComposerFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong>
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isQuadraComposerFormat, parseQuadraComposerFile } from '../formats/QuadraComposerParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FILE1 = resolve(REF, 'Quadra Composer/- unknown/synth corn.emod');
const FILE2 = resolve(REF, 'Quadra Composer/Blonde Lion/whittakerrhapsody.emod');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isQuadraComposerFormat', () => {
  it('detects synth corn.emod', () => {
    expect(isQuadraComposerFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects whittakerrhapsody.emod', () => {
    expect(isQuadraComposerFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isQuadraComposerFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseQuadraComposerFile — synth corn.emod', () => {
  it('parses without throwing', async () => {
    await expect(
      parseQuadraComposerFile(loadBuf(FILE1), 'synth corn.emod')
    ).resolves.toBeDefined();
  });

  it('reports format capabilities', async () => {
    const song = await parseQuadraComposerFile(loadBuf(FILE1), 'synth corn.emod');
    if (!song) {
      console.log('Parser returned null for synth corn.emod');
      return;
    }
    const report = analyzeFormat(song, 'synth corn.emod');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseQuadraComposerFile — whittakerrhapsody.emod', () => {
  it('parses without throwing', async () => {
    await expect(
      parseQuadraComposerFile(loadBuf(FILE2), 'whittakerrhapsody.emod')
    ).resolves.toBeDefined();
  });

  it('reports format capabilities', async () => {
    const song = await parseQuadraComposerFile(loadBuf(FILE2), 'whittakerrhapsody.emod');
    if (!song) {
      console.log('Parser returned null for whittakerrhapsody.emod');
      return;
    }
    const report = analyzeFormat(song, 'whittakerrhapsody.emod');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
