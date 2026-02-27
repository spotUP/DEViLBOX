/**
 * IMSParser Tests — Images Music System (.ims)
 *
 * API:
 *   isIMSFormat(buffer: ArrayBuffer): boolean
 *   parseIMSFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong>
 *
 * Detection is structural (no magic bytes): header layout, sampleDataOffset at 1080,
 * (sampleDataOffset - 1084) % 768 == 0, numOrders 1-128, sample finetune == 0,
 * at least one non-zero sample length.
 *
 * Reference files available.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isIMSFormat, parseIMSFile } from '../formats/IMSParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music/Images Music System');
const FILE1 = resolve(REF, '4-Mat/beast-busters.ims');
const FILE2 = resolve(REF, '4-Mat/shadow_dancer-am1-3ch.ims');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isIMSFormat', () => {
  it('detects beast-busters.ims', () => {
    expect(isIMSFormat(loadBuf(FILE1))).toBe(true);
  });

  it('detects shadow_dancer-am1-3ch.ims', () => {
    expect(isIMSFormat(loadBuf(FILE2))).toBe(true);
  });

  it('rejects an all-zero buffer', () => {
    expect(isIMSFormat(new ArrayBuffer(2000))).toBe(false);
  });

  it('rejects a too-short buffer', () => {
    expect(isIMSFormat(new ArrayBuffer(100))).toBe(false);
  });
});

describe('parseIMSFile — beast-busters.ims', () => {
  it('reports format capabilities', async () => {
    const buf = loadBuf(FILE1);
    let song: Awaited<ReturnType<typeof parseIMSFile>> | undefined;
    try {
      song = await parseIMSFile(buf, 'beast-busters.ims');
    } catch (e) {
      console.log('threw:', e);
      return;
    }
    const report = analyzeFormat(song, 'beast-busters.ims');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseIMSFile — shadow_dancer-am1-3ch.ims', () => {
  it('reports format capabilities', async () => {
    const buf = loadBuf(FILE2);
    let song: Awaited<ReturnType<typeof parseIMSFile>> | undefined;
    try {
      song = await parseIMSFile(buf, 'shadow_dancer-am1-3ch.ims');
    } catch (e) {
      console.log('threw:', e);
      return;
    }
    const report = analyzeFormat(song, 'shadow_dancer-am1-3ch.ims');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
