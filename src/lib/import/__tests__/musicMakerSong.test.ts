/**
 * MusicMaker V8 song decoding (MusicMakerParser's native half).
 *
 * Corpus: public/data/songs/formats/MusicMaker V8 Old/- unknown/ - moveback
 * (4-voice STD) and best of guitars (EXT, 7 voices). Facts below were read
 * from the files with the layout in MusicMaker4.asm / MusicMaker8.asm and
 * cross-checked in lock-step against UADE running the author's players
 * (thoughts/shared/research/2026-10-05_musicmaker-native-replayer.md).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  decodeMusicMakerSong, decodeMusicMakerInstruments, compileMusicMakerVoice,
  readMusicMakerIff, buildMusicMakerIff, isMusicMakerSongData, MM_OP,
} from '../formats/MusicMakerParser';
import { resolveCompanions } from '../companionResolver';

const DIR = resolve(process.cwd(), 'public/data/songs/formats/MusicMaker V8 Old/- unknown');
const bytes = (name: string) => new Uint8Array(readFileSync(resolve(DIR, name)));

describe('MusicMaker song type', () => {
  // The players' `_isstdsong` calls a song STD when byte 22 is $FF. moveback
  // has $00 there and is an STD song; best of guitars has $FF and is EXT.
  it('decodes moveback ($00 at byte 22) as a 4-voice STD song', () => {
    const song = decodeMusicMakerSong(bytes('moveback.sdata'));
    expect(bytes('moveback.sdata')[22]).toBe(0x00);
    expect(song).toMatchObject({ kind: 'std', voices: 4, pattlen: 64, speed: 920, name: 'make your move' });
    expect(song.melodies.map((m) => m.list.length)).toEqual([43, 43, 43, 43]);
  });

  it('decodes best of guitars ($FF at byte 22) as an EXT song with voice 5 off', () => {
    const song = decodeMusicMakerSong(bytes('best of guitars.sdata'));
    expect(bytes('best of guitars.sdata')[22]).toBe(0xff);
    expect(song).toMatchObject({ kind: 'ext', voices: 8, channelsEnabled: 0xef, pattlen: 64, speed: 800 });
    expect(song.melodies.map((m) => m.list.length)).toEqual([37, 37, 37, 37, 1, 37, 37, 37]);
  });

  it('refuses data that is not a MusicMaker song', () => {
    expect(isMusicMakerSongData(new Uint8Array(64))).toBe(false);
    expect(() => decodeMusicMakerSong(new Uint8Array(64))).toThrow(/'SE'/);
  });
});

describe('MusicMaker instruments', () => {
  it('decodes the packed .ip to its last byte, loops intact', () => {
    const ins = decodeMusicMakerInstruments(bytes('best of guitars.ip'));
    expect(ins.packed).toBe(true);
    expect(ins.count).toBe(36);
    expect(ins.samples.filter((s) => s.length).length).toBe(20);
    // Instrument 20 (index 19): plays 10430 bytes, then loops 4876 words from 678.
    expect(Array.from(ins.lens.slice(19 * 4, 19 * 4 + 4))).toEqual([10462, 10430, 678, 4876]);
    expect(ins.samples[19].length).toBe(10462);
    // HULL table 1 belongs to instrument 25 (its first word).
    expect(ins.lfoOffsets[1]).toBe(0);
    expect((ins.lfoData[0] << 8) | ins.lfoData[1]).toBe(25);
  });

  it('tells packed bytes from unpacked by their layout, whatever the name says', () => {
    // companionResolver once handed `.ip` bytes over as `.i`; the bytes decide.
    expect(decodeMusicMakerInstruments(bytes('moveback.ip'), false).packed).toBe(true);
  });

  it('the resolver hands the .ip over under its own name (the player picks the codec by name)', () => {
    const r = resolveCompanions('moveback.sdata', { siblings: readdirSync(DIR) });
    expect(r.companions).toEqual(['moveback.ip', 'moveback.ip.n']);
    expect(r.companions).not.toContain('moveback.i');
  });
});

describe('MusicMaker voice timelines', () => {
  it('every voice of moveback wraps at the same tick, 43 positions of 128 ticks after a 108-tick first one', () => {
    const song = decodeMusicMakerSong(bytes('moveback.sdata'));
    const tls = [0, 1, 2, 3].map((v) => compileMusicMakerVoice(song, v));
    expect(tls.map((t) => t.introTicks)).toEqual([5356, 5356, 5356, 5356]);
    expect(tls[0].positionTicks.slice(0, 4)).toEqual([0, 108, 236, 364]);
    expect(tls[0].positionTicks).toHaveLength(43);
    // The first event after the loop resets the voice, as internfinished does.
    expect(tls[0].cycle[0].reset).toBe(true);
  });

  it('best of guitars voice 3 sets a HULL table, then slides and fades', () => {
    const song = decodeMusicMakerSong(bytes('best of guitars.sdata'));
    const tl = compileMusicMakerVoice(song, 2);
    expect(tl.intro[0]).toMatchObject({ t: 0, op: MM_OP.HULL, value: 25, value2: 1 });
    expect(tl.intro[1]).toMatchObject({ t: 2, op: MM_OP.NOTE, inst: 25, note: 24, vol: 1, loop: true });
    expect(tl.intro.some((e) => e.op === MM_OP.FADE)).toBe(true);
    expect(tl.introTicks).toBe(4736);
  });

  it('round-trips through the single-file container (SDAT + PINS)', () => {
    const iff = buildMusicMakerIff(bytes('moveback.sdata'), bytes('moveback.ip'), true);
    const { song, instruments } = readMusicMakerIff(iff);
    expect(song.kind).toBe('std');
    expect(instruments.packed).toBe(true);
    expect(instruments.samples[0].length).toBe(2048);
  });
});
