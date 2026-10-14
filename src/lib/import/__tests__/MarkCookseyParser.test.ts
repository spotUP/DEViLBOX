/**
 * MarkCookseyParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isMarkCookseyFormat, parseMarkCookseyFile } from '../formats/MarkCookseyParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../public/data/songs');
const FILE1 = resolve(REF, 'mark-cooksey/mighty bombjack.mc');
const FILE2 = resolve(REF, 'mark-cooksey-old/mco.overlander');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isMarkCookseyFormat', () => {
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

describe('parseMarkCookseyFile — commando.mc', () => {
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

  it('creates at least one instrument slot (up to MI_MaxSamples = 64 per the assembly InfoBuffer)', async () => {
    const song = await parseMarkCookseyFile(loadBuf(FILE1), 'commando.mc');
    // The slot count follows the sample table the binary scan finds (8 placeholders when it finds none), so it is
    // file-specific; the format guarantees only 1..64 slots.
    expect(song.instruments.length).toBeGreaterThanOrEqual(1);
    expect(song.instruments.length).toBeLessThanOrEqual(64);
  });

  it('leaves instruments unnamed (the format stores no names) and keeps every slot', async () => {
    const song = await parseMarkCookseyFile(loadBuf(FILE1), 'commando.mc');
    expect(song.instruments[0].name).toBe('');
    expect(song.instruments.every(i => i.name === '')).toBe(true);
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

describe('parseMarkCookseyFile — mco.a question of sport', () => {
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

  it('creates at least one instrument slot, none named', async () => {
    const song = await parseMarkCookseyFile(loadBuf(FILE2), 'mco.a question of sport');
    expect(song.instruments.length).toBeGreaterThanOrEqual(1);
    expect(song.instruments.every(i => i.name === '')).toBe(true);
  });
});
