import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isRJPFormat, parseRJPFile } from '../formats/RichardJosephParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

// Richard Joseph Player is a two-file format: song data (.sng) + sample data (.ins).
// isRJPFormat and parseRJPFile operate on the song data (.sng) file only.
// The companion .ins file holds PCM samples and is not parsed here.

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
});
