/**
 * DaveLoweParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isDaveLoweFormat, parseDaveLoweFile } from '../formats/DaveLoweParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../public/data/songs');
const FILE1 = resolve(REF, 'dave-lowe/incredibleshrinkingsphere.dl');

function loadBytes(p: string): Uint8Array {
  return new Uint8Array(readFileSync(p));
}

function loadBuf(p: string): ArrayBuffer {
  const buf = readFileSync(p);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe('isDaveLoweFormat', () => {
  it('detects incredibleshrinkingsphere.dl', () => {
    expect(isDaveLoweFormat(loadBytes(FILE1))).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isDaveLoweFormat(new Uint8Array(64))).toBe(false);
  });
});

describe('parseDaveLoweFile — incredibleshrinkingsphere.dl', () => {
  it('parses without throwing', async () => {
    await expect(parseDaveLoweFile(loadBuf(FILE1), 'incredibleshrinkingsphere.dl')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseDaveLoweFile(loadBuf(FILE1), 'incredibleshrinkingsphere.dl');
    const report = analyzeFormat(song, 'incredibleshrinkingsphere.dl');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });

  it('extracts the embedded title "Incredible Shrinking Sphere" from offset 0x70', async () => {
    const song = await parseDaveLoweFile(loadBuf(FILE1), 'incredibleshrinkingsphere.dl');
    // Title string sits at file offset 0x70 (read from the header bytes with xxd)
    expect(song.name).toContain('Incredible Shrinking Sphere');
  });

  it('creates one instrument per 14-byte sample descriptor (19 in this file)', async () => {
    const song = await parseDaveLoweFile(loadBuf(FILE1), 'incredibleshrinkingsphere.dl');
    // Header longwords at 0x40 (SampleInfo=0x2220) and 0x44 (EndSampleInfo=0x232a): (0x232a-0x2220)/14 = 19
    expect(song.instruments).toHaveLength(19);
  });

  it('names instruments after the embedded author string "Dave Lowe" (offset 0x8c) and nothing else', async () => {
    const song = await parseDaveLoweFile(loadBuf(FILE1), 'incredibleshrinkingsphere.dl');
    expect(song.instruments[0].name).toBe('Dave Lowe 1');
    expect(song.instruments[18].name).toBe('Dave Lowe 19');
  });

  it('has 4 channels', async () => {
    const song = await parseDaveLoweFile(loadBuf(FILE1), 'incredibleshrinkingsphere.dl');
    expect(song.numChannels).toBe(4);
  });
});
