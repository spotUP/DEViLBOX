/**
 * TFM Music Maker (.tfe) loads through the chip-dump route with a grid and
 * the whole file for TFMEngine.
 *
 * Before 2026-10-05 `.tfe` was refused with "no replayer yet" (broken-formats
 * sweep, B8). Real corpus file: rainstorm.tfe (TFM Music Maker 0.5 layout, no
 * signature, RLE-packed header). Layout per ZXTune tfmmusicmaker.cpp.
 * That the TFM engine then plays it: liveSongFormat.test.ts (store routing),
 * src/engine/__tests__/tfmPlaysRainstorm.test.ts (the wasm renders it).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tryChipDumpParse } from '../parsers/ChipDumpParsers';
import { parseTfmMusicMakerFile, isTfmMusicMakerFormat, decompressTfm } from '../formats/TFMMusicMakerParser';
import { detectFormatFromContent } from '../FormatRegistry';

const FILE = join(process.cwd(), 'public/data/songs/tfm-music-maker/rainstorm.tfe');
const bytes = () => new Uint8Array(readFileSync(FILE));
const buffer = () => { const b = readFileSync(FILE); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
type Grid = { patterns: { channels: { rows: { note: number }[] }[] }[] };
const notesPerChannel = (song: Grid) =>
  Array.from({ length: 6 }, (_, ch) => song.patterns.reduce((n, p) => n + p.channels[ch].rows.filter((r) => r.note > 0 && r.note <= 96).length, 0));

describe('TFM Music Maker', () => {
  it('the chip-dump route hands a .tfe to the TFM parser with the whole file for the engine', async () => {
    const song = await tryChipDumpParse(buffer(), 'rainstorm.tfe', 'rainstorm.tfe');
    expect(song?.format).toBe('TFM');
    expect(song?.tfmFileData?.byteLength).toBe(bytes().length);
    expect(detectFormatFromContent('rainstorm.tfe', bytes())?.nativeParser?.module).toBe('@lib/import/formats/TFMMusicMakerParser');
  });

  it('unpacks the RLE header to the 0.5 layout: tempo 3/3, 41 positions', () => {
    const h = decompressTfm(bytes())!;
    expect(h.length).toBe(1981904);
    expect(h[0]).toBe(0x33);       // even/odd tempo 3/3
    expect(h[2]).toBe(41);         // positions
  });

  it('draws six FM channels with the decoded notes, in order-list order', async () => {
    const song = await parseTfmMusicMakerFile(buffer(), 'rainstorm.tfe');
    expect(song.name).toBe('Rainstorm');
    expect(song.numChannels).toBe(6);
    expect(song.songLength).toBe(41);
    expect(song.patterns.length).toBe(38);           // 41 positions, patterns 26/48/49 repeat
    expect(song.songPositions.slice(0, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 6]);
    expect(song.patterns[0].length).toBe(128);
    expect(song.initialSpeed).toBe(3);
    const perChannel = notesPerChannel(song);
    expect(perChannel.every((n) => n > 0)).toBe(true);
    expect(perChannel.reduce((a, b) => a + b, 0)).toBeGreaterThan(500);
    // Row 4 of the first pattern keys channel 1 (the player's frame-12 key-on).
    expect(song.patterns[0].channels[0].rows[4].note).toBeGreaterThan(0);
    expect(song.instruments.every((i) => i.synthType === 'TFMSynth')).toBe(true);
  });

  it('accepts the real file and rejects zeros and a truncated stream', () => {
    expect(isTfmMusicMakerFormat(bytes())).toBe(true);
    expect(isTfmMusicMakerFormat(new Uint8Array(4096))).toBe(false);
    expect(isTfmMusicMakerFormat(bytes().subarray(0, 2000))).toBe(false);
  });
});
