/**
 * DaveLoweParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isDaveLoweFormat, parseDaveLoweFile } from '../formats/DaveLoweParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const DL_DIR = resolve(REF, 'Dave Lowe/Dave Lowe');
const FILE1 = resolve(DL_DIR, 'afterburner.dl');
const FILE2 = resolve(DL_DIR, 'altered beast.dl');
const FILE_BANGKOK = resolve(DL_DIR, 'bangkok knights.dl');
const FILE_GHOSTBUSTERS = resolve(DL_DIR, 'ghostbusters2 jingle.dl');

function loadBytes(p: string): Uint8Array {
  return new Uint8Array(readFileSync(p));
}

function loadBuf(p: string): ArrayBuffer {
  const buf = readFileSync(p);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe('isDaveLoweFormat', () => {
  it('detects afterburner.dl', () => {
    expect(isDaveLoweFormat(loadBytes(FILE1))).toBe(true);
  });
  it('detects altered beast.dl', () => {
    expect(isDaveLoweFormat(loadBytes(FILE2))).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isDaveLoweFormat(new Uint8Array(64))).toBe(false);
  });
});

describe('parseDaveLoweFile — afterburner.dl', () => {
  it('parses without throwing', async () => {
    await expect(parseDaveLoweFile(loadBuf(FILE1), 'afterburner.dl')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseDaveLoweFile(loadBuf(FILE1), 'afterburner.dl');
    const report = analyzeFormat(song, 'afterburner.dl');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });

  it('extracts embedded title "After Burner" from offset 0x70', async () => {
    const song = await parseDaveLoweFile(loadBuf(FILE1), 'afterburner.dl');
    // Embedded title at 0x70 should override the filename-derived name
    expect(song.name).toContain('After Burner');
  });

  it('creates 8 placeholder instruments', async () => {
    const song = await parseDaveLoweFile(loadBuf(FILE1), 'afterburner.dl');
    expect(song.instruments).toHaveLength(8);
  });

  it('names instruments Sample 1..N (no names in format)', async () => {
    const song = await parseDaveLoweFile(loadBuf(FILE1), 'afterburner.dl');
    expect(song.instruments[0].name).toBe('Sample 1');
    expect(song.instruments[7].name).toBe('Sample 8');
  });

  it('has 4 channels', async () => {
    const song = await parseDaveLoweFile(loadBuf(FILE1), 'afterburner.dl');
    expect(song.numChannels).toBe(4);
  });
});

describe('parseDaveLoweFile — altered beast.dl', () => {
  it('parses without throwing', async () => {
    await expect(parseDaveLoweFile(loadBuf(FILE2), 'altered beast.dl')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseDaveLoweFile(loadBuf(FILE2), 'altered beast.dl');
    const report = analyzeFormat(song, 'altered beast.dl');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseDaveLoweFile — bangkok knights.dl', () => {
  it('extracts embedded title "Bangkok Knights"', async () => {
    const song = await parseDaveLoweFile(loadBuf(FILE_BANGKOK), 'bangkok knights.dl');
    expect(song.name).toContain('Bangkok Knights');
  });
});

describe('parseDaveLoweFile — ghostbusters2 jingle.dl', () => {
  it('extracts embedded title "Ghostbusters II jingle"', async () => {
    const song = await parseDaveLoweFile(loadBuf(FILE_GHOSTBUSTERS), 'ghostbusters2 jingle.dl');
    expect(song.name).toContain('Ghostbusters II jingle');
  });
});
