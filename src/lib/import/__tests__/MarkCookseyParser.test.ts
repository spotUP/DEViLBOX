/**
 * MarkCookseyParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isMarkCookseyFormat, parseMarkCookseyFile } from '../formats/MarkCookseyParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const MC_DIR = resolve(REF, 'Mark Cooksey/Mark Cooksey');
const MC_OLD_DIR = resolve(REF, 'Mark Cooksey Old/Mark Cooksey');
const FILE1 = resolve(MC_DIR, 'commando.mc');
const FILE2 = resolve(MC_OLD_DIR, 'mco.a question of sport');

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
});
