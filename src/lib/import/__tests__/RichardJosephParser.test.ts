import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isRJPFormat, parseRJPFile } from '../formats/RichardJosephParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

// Richard Joseph Player is a two-file format: song data (.sng) + sample data (.ins).
// isRJPFormat and parseRJPFile operate on the song data (.sng) file only.
// The companion .ins file holds PCM samples and is not parsed here.
//
// The format contains NO instrument names — the player source (Richard Joseph Player_v2.asm)
// sets EPS_Adr, EPS_Length, EPS_Volume, EPS_Type, EPS_Flags but never EPS_Name.

const REF = resolve(import.meta.dirname, '../../../../public/data/songs');
const FILE_SNG = resolve(REF, 'richard-joseph/cannon fodder (intro).sng');

function loadU8(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isRJPFormat', () => {
  it('detects cannon fodder (intro).sng', () => expect(isRJPFormat(loadU8(FILE_SNG))).toBe(true));
  it('rejects a zeroed buffer', () => expect(isRJPFormat(new Uint8Array(64))).toBe(false));
  it('rejects a buffer that is too short', () => expect(isRJPFormat(new Uint8Array(8))).toBe(false));
});

describe('parseRJPFile — cannon fodder (intro).sng', () => {
  it('reports format capabilities', async () => {
    let song;
    try { song = await parseRJPFile(loadBuf(FILE_SNG), 'cannon fodder (intro).sng'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'cannon fodder (intro).sng');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });

  it('extracts 25 instrument placeholders', async () => {
    const song = await parseRJPFile(loadBuf(FILE_SNG), 'cannon fodder (intro).sng');
    // First chunk (sample descriptors) is 800 bytes (header longword at 0x08) → 800/32 = 25 samples
    expect(song.instruments).toHaveLength(25);
  });

  it('leaves instruments unnamed (the format stores no names) and keeps every slot', async () => {
    const song = await parseRJPFile(loadBuf(FILE_SNG), 'cannon fodder (intro).sng');
    expect(song.instruments[0].name).toBe('');
    expect(song.instruments[24].name).toBe('');
  });

  it('detects 2 subsongs', async () => {
    const song = await parseRJPFile(loadBuf(FILE_SNG), 'cannon fodder (intro).sng');
    // Song name contains subsong count: chunk 2 (subsong table) is 8 bytes, 4 bytes per subsong → 2
    expect(song.name).toContain('2 sub');
  });

  it('stores loop metadata on each instrument', async () => {
    const song = await parseRJPFile(loadBuf(FILE_SNG), 'cannon fodder (intro).sng');
    for (const inst of song.instruments) {
      expect(inst.metadata?.rjpSample).toBeDefined();
      const rjp = inst.metadata!.rjpSample as { loopStart: number; loopSize: number; hasLoop: boolean; lengthBytes: number };
      expect(rjp.loopSize).toBeGreaterThanOrEqual(0);
      expect(typeof rjp.hasLoop).toBe('boolean');
    }
  });

  it('has 4 channels', async () => {
    const song = await parseRJPFile(loadBuf(FILE_SNG), 'cannon fodder (intro).sng');
    expect(song.numChannels).toBe(4);
  });
});
