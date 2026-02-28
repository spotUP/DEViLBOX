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

  it('creates 1 placeholder instrument (no names in format)', () => {
    const song = parseWallyBebenFile(loadBuf(FILE_BALLGAME), 'ballgame.wb');
    // Wally Beben is a compiled 68k executable — instrument count is a placeholder
    expect(song.instruments).toHaveLength(1);
    expect(song.instruments[0].name).toBe('Sample 1');
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

  it('creates 1 placeholder instrument', () => {
    const song = parseWallyBebenFile(loadBuf(FILE_CIRCUS), 'circusgames.wb');
    expect(song.instruments).toHaveLength(1);
  });
});
