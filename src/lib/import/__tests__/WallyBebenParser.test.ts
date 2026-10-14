import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isWallyBebenFormat, parseWallyBebenFile } from '../formats/WallyBebenParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../public/data/songs');
const FILE_BALLGAME = resolve(REF, 'wally-beben/wicked.wb');
const FILE_CIRCUS = resolve(REF, 'formats/wicked.wb');

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isWallyBebenFormat', () => {
  it('detects ballgame.wb', () => expect(isWallyBebenFormat(loadBuf(FILE_BALLGAME))).toBe(true));
  it('detects circusgames.wb', () => expect(isWallyBebenFormat(loadBuf(FILE_CIRCUS))).toBe(true));
  it('rejects a zeroed buffer', () => expect(isWallyBebenFormat(new ArrayBuffer(64))).toBe(false));
  it('rejects a buffer that is too short', () => expect(isWallyBebenFormat(new ArrayBuffer(8))).toBe(false));
});

describe('parseWallyBebenFile — ballgame.wb', () => {
  it('reports format capabilities', () => {
    const song = parseWallyBebenFile(loadBuf(FILE_BALLGAME), 'ballgame.wb');
    const report = analyzeFormat(song, 'ballgame.wb');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });

  it('creates at least one instrument, none named (no names in format)', () => {
    const song = parseWallyBebenFile(loadBuf(FILE_BALLGAME), 'ballgame.wb');
    // Wally Beben is a compiled 68k executable: the sample pointer table is located by a code scan, so the count is
    // file-specific (1 placeholder when no table is found, up to 64 samples otherwise)
    expect(song.instruments.length).toBeGreaterThanOrEqual(1);
    expect(song.instruments.every(i => i.name === '')).toBe(true);
  });

  it('has 4 channels', () => {
    const song = parseWallyBebenFile(loadBuf(FILE_BALLGAME), 'ballgame.wb');
    expect(song.numChannels).toBe(4);
  });

  it('derives module name from filename', () => {
    const song = parseWallyBebenFile(loadBuf(FILE_BALLGAME), 'ballgame.wb');
    expect(song.name).toContain('ballgame');
  });
});

describe('parseWallyBebenFile — circusgames.wb', () => {
  it('reports format capabilities', () => {
    const song = parseWallyBebenFile(loadBuf(FILE_CIRCUS), 'circusgames.wb');
    const report = analyzeFormat(song, 'circusgames.wb');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });

  it('creates at least one instrument', () => {
    const song = parseWallyBebenFile(loadBuf(FILE_CIRCUS), 'circusgames.wb');
    expect(song.instruments.length).toBeGreaterThanOrEqual(1);
  });
});
