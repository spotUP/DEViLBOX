import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isSeanConranFormat, parseSeanConranFile } from '../formats/SeanConranParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FILE_DUCKULA1 = resolve(REF, 'Sean Conran/Sean Conran/count duckula-1.scr');
const FILE_DUCKULA2 = resolve(REF, 'Sean Conran/Sean Conran/count duckula-2.scr');

function loadU8(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isSeanConranFormat', () => {
  it('detects count duckula-1.scr', () => expect(isSeanConranFormat(loadU8(FILE_DUCKULA1))).toBe(true));
  it('detects count duckula-2.scr', () => expect(isSeanConranFormat(loadU8(FILE_DUCKULA2))).toBe(true));
  it('rejects a zeroed buffer', () => expect(isSeanConranFormat(new Uint8Array(512))).toBe(false));
});

describe('parseSeanConranFile — count duckula-1.scr', () => {
  it('reports format capabilities', async () => {
    let song;
    try { song = await parseSeanConranFile(loadBuf(FILE_DUCKULA1), 'count duckula-1.scr'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'count duckula-1.scr');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseSeanConranFile — count duckula-2.scr', () => {
  it('reports format capabilities', async () => {
    let song;
    try { song = await parseSeanConranFile(loadBuf(FILE_DUCKULA2), 'count duckula-2.scr'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'count duckula-2.scr');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
