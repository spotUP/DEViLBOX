/**
 * MaximumEffectParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isMaximumEffectFormat, parseMaximumEffectFile } from '../formats/MaximumEffectParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const DIR1 = resolve(REF, 'MaxTrax/- unknown');
const DIR2 = resolve(REF, 'MaxTrax/David A. Bean');
const FILE1 = resolve(DIR1, 'contraptionzack-agro.mxtx');
const FILE2 = resolve(DIR2, 'darkseed (00).mxtx');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isMaximumEffectFormat', () => {
  it('detects contraptionzack-agro.mxtx', () => {
    expect(isMaximumEffectFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects darkseed (00).mxtx', () => {
    expect(isMaximumEffectFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isMaximumEffectFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseMaximumEffectFile — contraptionzack-agro.mxtx', () => {
  it('parses without throwing', () => {
    expect(() => parseMaximumEffectFile(loadBuf(FILE1), 'contraptionzack-agro.mxtx')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseMaximumEffectFile(loadBuf(FILE1), 'contraptionzack-agro.mxtx');
    const report = analyzeFormat(song, 'contraptionzack-agro.mxtx');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseMaximumEffectFile — darkseed (00).mxtx', () => {
  it('parses without throwing', () => {
    expect(() => parseMaximumEffectFile(loadBuf(FILE2), 'darkseed (00).mxtx')).not.toThrow();
  });
  it('reports format capabilities', () => {
    const song = parseMaximumEffectFile(loadBuf(FILE2), 'darkseed (00).mxtx');
    const report = analyzeFormat(song, 'darkseed (00).mxtx');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
