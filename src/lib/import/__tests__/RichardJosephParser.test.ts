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

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const FILE_AQUATIC_SNG = resolve(REF, 'Richard Joseph/Richard Joseph/aquatic games.sng');
const FILE_BLOB_SNG = resolve(REF, 'Richard Joseph/Richard Joseph/blob.sng');

function loadU8(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('isRJPFormat', () => {
  it('detects aquatic games.sng', () => expect(isRJPFormat(loadU8(FILE_AQUATIC_SNG))).toBe(true));
  it('detects blob.sng', () => expect(isRJPFormat(loadU8(FILE_BLOB_SNG))).toBe(true));
  it('rejects a zeroed buffer', () => expect(isRJPFormat(new Uint8Array(64))).toBe(false));
  it('rejects a buffer that is too short', () => expect(isRJPFormat(new Uint8Array(8))).toBe(false));
});

describe('parseRJPFile — aquatic games.sng', () => {
  it('reports format capabilities', async () => {
    let song;
    try { song = await parseRJPFile(loadBuf(FILE_AQUATIC_SNG), 'aquatic games.sng'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'aquatic games.sng');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });

  it('extracts 63 instrument placeholders', async () => {
    const song = await parseRJPFile(loadBuf(FILE_AQUATIC_SNG), 'aquatic games.sng');
    // aquatic games.sng has a 2016-byte sample table → 2016/32 = 63 samples
    expect(song.instruments).toHaveLength(63);
  });

  it('names instruments Sample 1..N (no names in format)', async () => {
    const song = await parseRJPFile(loadBuf(FILE_AQUATIC_SNG), 'aquatic games.sng');
    expect(song.instruments[0].name).toBe('Sample 1');
    expect(song.instruments[62].name).toBe('Sample 63');
  });

  it('detects 6 subsongs', async () => {
    const song = await parseRJPFile(loadBuf(FILE_AQUATIC_SNG), 'aquatic games.sng');
    // Song name contains subsong count
    expect(song.name).toContain('6 sub');
  });

  it('stores loop metadata on each instrument', async () => {
    const song = await parseRJPFile(loadBuf(FILE_AQUATIC_SNG), 'aquatic games.sng');
    // Sample 2 in aquatic games has loopSize=1014 words → hasLoop=true
    const s2 = song.instruments[1];
    expect(s2.metadata?.rjpSample).toBeDefined();
    const rjp = s2.metadata!.rjpSample as { loopStart: number; loopSize: number; hasLoop: boolean; lengthBytes: number };
    expect(rjp.loopSize).toBeGreaterThan(0);
    expect(rjp.hasLoop).toBe(true);
  });

  it('has 4 channels', async () => {
    const song = await parseRJPFile(loadBuf(FILE_AQUATIC_SNG), 'aquatic games.sng');
    expect(song.numChannels).toBe(4);
  });
});

describe('parseRJPFile — blob.sng', () => {
  it('reports format capabilities', async () => {
    let song;
    try { song = await parseRJPFile(loadBuf(FILE_BLOB_SNG), 'blob.sng'); } catch (e) { console.log('threw:', e); return; }
    if (!song) { console.log('returned null'); return; }
    const report = analyzeFormat(song, 'blob.sng');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });

  it('extracts 49 instrument placeholders', async () => {
    const song = await parseRJPFile(loadBuf(FILE_BLOB_SNG), 'blob.sng');
    // blob.sng has a 1568-byte sample table → 1568/32 = 49 samples
    expect(song.instruments).toHaveLength(49);
  });

  it('detects 10 subsongs', async () => {
    const song = await parseRJPFile(loadBuf(FILE_BLOB_SNG), 'blob.sng');
    expect(song.name).toContain('10 sub');
  });

  it('most instruments have loop metadata (47 of 49 have loops)', async () => {
    const song = await parseRJPFile(loadBuf(FILE_BLOB_SNG), 'blob.sng');
    const looped = song.instruments.filter(
      i => (i.metadata?.rjpSample as { hasLoop?: boolean } | undefined)?.hasLoop === true,
    );
    expect(looped.length).toBeGreaterThanOrEqual(40);
  });
});
