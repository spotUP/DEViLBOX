/**
 * Studio Pixel PiyoPiyo (.pmd) loads through the chip-dump route with a grid
 * and the whole file for the engine.
 *
 * Before 2026-10-05 the .pmd extension went to the PC-98 PMD parser (the
 * file's 'PMD' magic is PiyoPiyo's) and the jukebox marked it "Silent"
 * (ledger B5). Real corpus file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tryChipDumpParse } from '../parsers/ChipDumpParsers';
import { parsePiyoPiyoFile, readPiyoPiyoHeader, piyoPiyoTempo } from '../formats/PiyoPiyoParser';

const FILE = join(process.cwd(), 'public/data/songs/studio-pixel---piyopiyo/obj0176-1.pmd');
const bytes = () => new Uint8Array(readFileSync(FILE));
const buffer = () => { const b = readFileSync(FILE); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const noteCount = (song: { patterns: { channels: { rows: { note: number }[] }[] }[] }) =>
  song.patterns.reduce((n, p) => n + p.channels.reduce((m, c) => m + c.rows.filter((r) => r.note > 0).length, 0), 0);

describe('PiyoPiyo', () => {
  it('the chip-dump route hands a .pmd with PMD magic to the PiyoPiyo parser', async () => {
    const song = await tryChipDumpParse(buffer(), 'obj0176-1.pmd', 'obj0176-1.pmd');
    expect(song?.format).toBe('PiyoPiyo');
    expect(song?.piyoPiyoFileData?.byteLength).toBe(bytes().length);
  });

  it('draws four channels, one row per record, the lowest key of each chord as the note', async () => {
    const h = readPiyoPiyoHeader(bytes());
    expect(h.records).toBe(256);
    expect(h.waitMs).toBe(120);
    const song = await parsePiyoPiyoFile(buffer(), 'obj0176-1.pmd');
    expect(song.numChannels).toBe(4);
    expect(song.patterns.length).toBe(4);
    expect(song.instruments.map((i) => i.synthType)).toEqual(['PiyoPiyoSynth', 'PiyoPiyoSynth', 'PiyoPiyoSynth', 'PiyoPiyoSynth']);
    expect(noteCount(song)).toBeGreaterThan(50);
    expect(song.initialSpeed).toBe(piyoPiyoTempo(120).speed);
  });

  it('tempo: the smallest speed that keeps the BPM in range', () => {
    expect(piyoPiyoTempo(120)).toEqual({ speed: 2, bpm: 42 });
    expect(piyoPiyoTempo(40)).toEqual({ speed: 1, bpm: 63 });
  });
});
