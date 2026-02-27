/**
 * TFMXParser Tests - Format capability analysis
 *
 * API:
 *   isTFMXFile(buffer: ArrayBuffer): boolean
 *   parseTFMXFile(buffer: ArrayBuffer, filename: string): TrackerSong  (sync)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isTFMXFile, parseTFMXFile } from '../formats/TFMXParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FILE1 = resolve(REF, 'TFMX/- unknown/mdat.bb-beat');
const FILE2 = resolve(REF, 'TFMX/Chris Huelsbeck/mdat.apidya (level 1)');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isTFMXFile', () => {
  it('detects mdat.bb-beat', () => {
    expect(isTFMXFile(loadBuf(FILE1))).toBe(true);
  });
  it('detects mdat.apidya (level 1)', () => {
    expect(isTFMXFile(loadBuf(FILE2))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isTFMXFile(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseTFMXFile — mdat.bb-beat', () => {
  it('parses without throwing', () => {
    expect(() => parseTFMXFile(loadBuf(FILE1), 'mdat.bb-beat')).not.toThrow();
  });

  it('reports format capabilities', () => {
    let song: ReturnType<typeof parseTFMXFile> | undefined;
    try {
      song = parseTFMXFile(loadBuf(FILE1), 'mdat.bb-beat');
    } catch (e) {
      console.log('Parser threw for mdat.bb-beat:', e);
      return;
    }
    if (!song) {
      console.log('Parser returned null/undefined for mdat.bb-beat');
      return;
    }
    const report = analyzeFormat(song, 'mdat.bb-beat');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseTFMXFile — mdat.apidya (level 1)', () => {
  it('parses without throwing', () => {
    expect(() => parseTFMXFile(loadBuf(FILE2), 'mdat.apidya (level 1)')).not.toThrow();
  });

  it('reports format capabilities', () => {
    let song: ReturnType<typeof parseTFMXFile> | undefined;
    try {
      song = parseTFMXFile(loadBuf(FILE2), 'mdat.apidya (level 1)');
    } catch (e) {
      console.log('Parser threw for mdat.apidya (level 1):', e);
      return;
    }
    if (!song) {
      console.log('Parser returned null/undefined for mdat.apidya (level 1)');
      return;
    }
    const report = analyzeFormat(song, 'mdat.apidya (level 1)');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
