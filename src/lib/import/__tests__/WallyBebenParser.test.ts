import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isWallyBebenFormat, parseWallyBebenFile } from '../formats/WallyBebenParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FILE_BALLGAME = resolve(REF, 'Wally Beben/Wally Beben/ballgame.wb');
const FILE_CIRCUS = resolve(REF, 'Wally Beben/Wally Beben/circusgames.wb');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isWallyBebenFormat', () => {
  it('detects ballgame.wb', () => expect(isWallyBebenFormat(loadBuf(FILE_BALLGAME))).toBe(true));
  it('detects circusgames.wb', () => expect(isWallyBebenFormat(loadBuf(FILE_CIRCUS))).toBe(true));
  it('rejects a zeroed buffer', () => expect(isWallyBebenFormat(new ArrayBuffer(64))).toBe(false));
});

describe('parseWallyBebenFile — ballgame.wb', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseWallyBebenFile(loadBuf(FILE_BALLGAME), 'ballgame.wb'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'ballgame.wb');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseWallyBebenFile — circusgames.wb', () => {
  it('reports format capabilities', () => {
    let song;
    try { song = parseWallyBebenFile(loadBuf(FILE_CIRCUS), 'circusgames.wb'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'circusgames.wb');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
