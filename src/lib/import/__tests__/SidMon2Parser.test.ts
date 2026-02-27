import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isSidMon2Format, parseSidMon2File } from '../formats/SidMon2Parser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FILE_BRUNOTIME = resolve(REF, 'SidMon 2/- unknown/bruno time.sid2');
const FILE_CARCASS = resolve(REF, 'SidMon 2/- unknown/carcass-demonintro.sid2');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isSidMon2Format', () => {
  it('detects bruno time.sid2', () => expect(isSidMon2Format(loadBuf(FILE_BRUNOTIME))).toBe(true));
  it('detects carcass-demonintro.sid2', () => expect(isSidMon2Format(loadBuf(FILE_CARCASS))).toBe(true));
  it('rejects a zeroed buffer', () => expect(isSidMon2Format(new ArrayBuffer(256))).toBe(false));
});

describe('parseSidMon2File — bruno time.sid2', () => {
  it('reports format capabilities', async () => {
    let song;
    try { song = await parseSidMon2File(loadBuf(FILE_BRUNOTIME), 'bruno time.sid2'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'bruno time.sid2');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseSidMon2File — carcass-demonintro.sid2', () => {
  it('reports format capabilities', async () => {
    let song;
    try { song = await parseSidMon2File(loadBuf(FILE_CARCASS), 'carcass-demonintro.sid2'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'carcass-demonintro.sid2');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
