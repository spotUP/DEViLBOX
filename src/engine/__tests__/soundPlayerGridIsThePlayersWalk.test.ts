/**
 * Sound Player (SJS.*): the grid is the song data the player reads, not an
 * estimate, and it encodes back to the file byte for byte.
 *
 * Before 2026-10-06 SoundPlayerParser drew one empty 64-row pattern (the
 * app fell to UADE's scan), so every assertion below failed. The structures
 * (SoundPlayer_v1.asm, thoughts/shared/research/2026-10-06_soundplayer-format.md):
 * a 3-byte header, then 12-byte rows of [note, instrument, command] per
 * voice, each voice walking the rows on its own (waits, loops, song end).
 *
 *  - every corpus file decodes to header + rows and encodes back exactly,
 *    and every grid cell re-encodes to the very bytes it came from;
 *  - every command byte (all 256) survives the grid's effect columns;
 *  - per voice, the grid holds the note-ons Paula plays: the counts UADE's
 *    Paula log gave for the whole song (tools/uade-audit/gridVsPaula.ts,
 *    2026-10-06; every channel scored 1.00 on note order). Where UADE stops
 *    at the song end before the last row's note reaches Paula, the grid has
 *    that one note more (marked +1);
 *  - a wait keeps its voice silent on the grid for exactly its rows.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSoundPlayerFile } from '@/lib/import/formats/SoundPlayerParser';
import {
  decodeSoundPlayerModule, encodeSoundPlayerModule, decodeSPCell, encodeSPCell, decodeSPCommand,
} from '@/lib/import/formats/soundPlayerCodec';
import { getCellFileOffset, type UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { SPL_FX } from '@/lib/import/formats/soundPlayerEffectGlyphs';

const DIR = resolve(process.cwd(), 'public/data/songs/formats/Scott Johnston');
const SONGS = readdirSync(DIR).filter((f) => f.startsWith('sjs.')).sort();

function load(name: string): { bytes: Uint8Array; ab: ArrayBuffer } {
  const b = readFileSync(resolve(DIR, name));
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return { bytes: new Uint8Array(ab), ab };
}

/** Paula note-ons per voice over the whole song (UADE, 2026-10-06); '+1' = the grid's last-row note UADE cuts off. */
const PAULA_NOTE_ONS: Record<string, string> = {
  'sjs.awesome': '282/120/144', 'sjs.beasti': '177/70/149', 'sjs.beastii': '420/169/239',
  'sjs.cancan': '232/164/134', 'sjs.doggie': '196/134/132', 'sjs.jb': '274+1/767+1/198+1',
  'sjs.kw': '227/214/207', 'sjs.lemming1': '256/198/241', 'sjs.lemming2': '468/958+1/460',
  'sjs.lemming3': '331/195/266', 'sjs.lemmings intro': '44/47/32/1', 'sjs.menace': '484/419/485',
  'sjs.mountain': '134/221/235', 'sjs.rudi': '219/170/190', 'sjs.tenlemmings': '206/182/171',
  'sjs.tim1': '442/548/395+1', 'sjs.tim10': '186/230/320', 'sjs.tim2': '182/212/128',
  'sjs.tim3': '216/272/264', 'sjs.tim4': '384/384/299+1', 'sjs.tim5': '640/308/323+1',
  'sjs.tim6': '274/316/290', 'sjs.tim7': '256/242/286', 'sjs.tim8': '256/300/114',
  'sjs.tim9': '128/179/212', 'sjs.tune1': '218/111/199', 'sjs.tune2': '224/190/129',
  'sjs.tune3': '231/208/244', 'sjs.tune4': '163/249/204', 'sjs.tune5': '206/116/218',
  'sjs.tune6': '151/83/133',
};
const expectedNotes = (s: string) => s.split('/').map((v) => v.split('+').reduce((a, b) => a + Number(b), 0));

describe('Sound Player: decode -> encode is the file', () => {
  it('covers the whole corpus', () => {
    expect(SONGS.length).toBe(31);
    expect(Object.keys(PAULA_NOTE_ONS).sort()).toEqual(SONGS);
  });

  it.each(SONGS)('%s: module and every grid cell round-trip byte-exact', (name) => {
    const { bytes, ab } = load(name);
    expect([...encodeSoundPlayerModule(decodeSoundPlayerModule(bytes))]).toEqual([...bytes]);

    const song = parseSoundPlayerFile(ab, name);
    const layout = song.uadePatternLayout as UADEPatternLayout;
    let mapped = 0;
    song.patterns.forEach((p, pi) => p.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
      const off = getCellFileOffset(layout, pi, r, c);
      if (off < 0) return;
      mapped++;
      const orig = bytes.subarray(off, off + 3);
      expect([...encodeSPCell(cell)], `${name} p${pi} r${r} c${c}`).toEqual([...orig]);
      expect(decodeSPCell(orig)).toEqual(cell);
    })));
    expect(mapped).toBeGreaterThan(100);
  });

  it('every command byte survives the effect columns', () => {
    for (let c = 0; c < 256; c++) {
      const cell = decodeSPCell(new Uint8Array([0, 0, c]));
      expect(encodeSPCell(cell)[2], `command $${c.toString(16)}`).toBe(c);
    }
  });
});

describe('Sound Player: the grid is what the player plays', () => {
  it.each(SONGS)('%s: note-ons per voice match Paula', (name) => {
    const { ab } = load(name);
    const song = parseSoundPlayerFile(ab, name);
    const counts = song.patterns[0].channels.map((_, c) =>
      song.patterns.reduce((n, p) => n + p.channels[c].rows.filter((r) => r.note > 0 && r.note < 97).length, 0));
    expect(counts).toEqual(expectedNotes(PAULA_NOTE_ONS[name]));
  });

  it('a wait holds its voice for exactly its rows (sjs.tune6, voice 2 row 2: wait 13)', () => {
    const { bytes, ab } = load('sjs.tune6');
    expect(decodeSPCommand(bytes[3 + 2 * 12 + 3 + 2])).toEqual({ kind: 'wait', rows: 13 });
    const song = parseSoundPlayerFile(ab, 'sjs.tune6');
    const rows = song.patterns[0].channels[1].rows;
    expect(rows[2]).toMatchObject({ effTyp: SPL_FX.wait, eff: 13 });
    // Rows 3..14 have no bytes behind them; row 15 is file row 3 (note $17).
    for (let r = 3; r < 15; r++) {
      expect(getCellFileOffset(song.uadePatternLayout as UADEPatternLayout, 0, r, 1)).toBe(-1);
      expect(rows[r].note).toBe(0);
    }
    expect(getCellFileOffset(song.uadePatternLayout as UADEPatternLayout, 0, 15, 1)).toBe(3 + 3 * 12 + 3);
    expect(rows[15].note).toBeGreaterThan(0);
  });

  it('the song plays at its CIA timer: 6 ticks a row, voice mask 7 = three channels', () => {
    const { ab } = load('sjs.tune6');
    const song = parseSoundPlayerFile(ab, 'sjs.tune6');
    expect(song.initialSpeed).toBe(6);
    expect(song.numChannels).toBe(3);
    // timer $2C83 = 11395 -> 62.25 ticks/s -> 155.6 BPM
    expect(song.initialBPM).toBe(156);
    // 384 row ticks to the song end ($DE at row tick 383 on every voice)
    expect(song.patterns.reduce((n, p) => n + p.length, 0)).toBe(384);
  });

  it('samples come from smp.<tune> in InstallSamples slot order', () => {
    const { ab } = load('sjs.tune6');
    const smp = readFileSync(resolve(DIR, 'smp.tune6'));
    const song = parseSoundPlayerFile(ab, 'sjs.tune6', new Map([['smp.tune6', smp.buffer.slice(smp.byteOffset, smp.byteOffset + smp.byteLength)]]));
    expect(song.instruments.map((i) => i.id)).toEqual([1, 2, 5, 12, 13]);
    expect(song.instruments.find((i) => i.id === 5)?.name).toBe('bass3');
  });
});
