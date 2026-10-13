/**
 * MarkCookseyParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { isMarkCookseyFormat, parseMarkCookseyFile } from '../formats/MarkCookseyParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
// Reference Music is a local-only corpus (gitignored, absent from a clean checkout): skip, do not fail.
const HAS_CORPUS = existsSync(REF);
const MC_DIR = resolve(REF, 'Mark Cooksey/Mark Cooksey');
const MC_OLD_DIR = resolve(REF, 'Mark Cooksey Old/Mark Cooksey');
const FILE1 = resolve(MC_DIR, 'commando.mc');
const FILE2 = resolve(MC_OLD_DIR, 'mco.a question of sport');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe.skipIf(!HAS_CORPUS)('isMarkCookseyFormat', () => {
  it('detects commando.mc', () => {
    expect(isMarkCookseyFormat(loadBuf(FILE1), 'commando.mc')).toBe(true);
  });
  it('detects mco.a question of sport', () => {
    expect(isMarkCookseyFormat(loadBuf(FILE2), 'mco.a question of sport')).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isMarkCookseyFormat(new ArrayBuffer(64))).toBe(false);
  });
  it('rejects a buffer that is too short', () => {
    expect(isMarkCookseyFormat(new ArrayBuffer(8))).toBe(false);
  });
});

describe.skipIf(!HAS_CORPUS)('parseMarkCookseyFile — commando.mc', () => {
  it('parses without throwing', async () => {
    await expect(parseMarkCookseyFile(loadBuf(FILE1), 'commando.mc')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseMarkCookseyFile(loadBuf(FILE1), 'commando.mc');
    const report = analyzeFormat(song, 'commando.mc');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });

  it('creates 64 placeholder instruments (MAX_SAMPLES per InfoBuffer)', async () => {
    const song = await parseMarkCookseyFile(loadBuf(FILE1), 'commando.mc');
    // MI_MaxSamples = 64 per the assembly InfoBuffer declaration
    expect(song.instruments).toHaveLength(64);
  });

  it('leaves instruments unnamed (the format stores no names) and keeps every slot', async () => {
    const song = await parseMarkCookseyFile(loadBuf(FILE1), 'commando.mc');
    expect(song.instruments[0].name).toBe('');
    expect(song.instruments[63].name).toBe('');
  });

  it('has 4 channels', async () => {
    const song = await parseMarkCookseyFile(loadBuf(FILE1), 'commando.mc');
    expect(song.numChannels).toBe(4);
  });

  it('derives module name from filename', async () => {
    const song = await parseMarkCookseyFile(loadBuf(FILE1), 'commando.mc');
    expect(song.name).toContain('commando');
  });
});

describe.skipIf(!HAS_CORPUS)('parseMarkCookseyFile — mco.a question of sport', () => {
  it('parses without throwing', async () => {
    await expect(parseMarkCookseyFile(loadBuf(FILE2), 'mco.a question of sport')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseMarkCookseyFile(loadBuf(FILE2), 'mco.a question of sport');
    const report = analyzeFormat(song, 'mco.a question of sport');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });

  it('creates 64 placeholder instruments', async () => {
    const song = await parseMarkCookseyFile(loadBuf(FILE2), 'mco.a question of sport');
    expect(song.instruments).toHaveLength(64);
  });
});
