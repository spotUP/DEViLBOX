/**
 * Non-808 bass song files (schema 3): bar.bass = {voice, seed} and "bass:<row>" side entries {ebass: {semi, dur, glide, vel}}.
 * Fixture generator (run in the host repo, Up_Rough_Demo_System):
 *   python3.11 -c "import sys,json; sys.path.insert(0,'tools'); import song_file as s, synth_common; hh=synth_common.load('hiphop'); s.save(s.export(hh.generate_events('golden_era',3,bars=4,use_trap808=False)),'ebass_sampled.uprough-song.json')"
 * (the song_file.py CLI has no use_trap808 switch, and golden_era plays the deep-trap 808 by default).
 */
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/ebass_sampled.uprough-song.json';
import { parseSongFile, songFileToSong, songToSongFile, type SongFileDoc } from '../songFile';

const load = (): SongFileDoc => structuredClone(fixture) as unknown as SongFileDoc;
const firstEbass = (d: SongFileDoc): Record<string, unknown> => {
  for (const entries of Object.values(d.side)) for (const e of Object.values(entries)) if ('ebass' in e) return (e as { ebass: Record<string, unknown> }).ebass;
  throw new Error('fixture has no ebass entry');
};

describe('non-808 bass song file', () => {
  it('parses and export(import(f)) deep-equals f, with the bass on the sampled softsynth voice', () => {
    const f = load();
    const song = songFileToSong(parseSongFile(structuredClone(f)));
    expect(f.instruments.some((i) => i.voice === 'sampled')).toBe(true);
    expect(song.instruments.some((i) => i.upRoughSoftsynth?.voice === 'bassSampled')).toBe(true);
    expect(songToSongFile(song)).toEqual(f);
  });

  it('refuses a malformed ebass entry', () => {
    const a = load();
    (firstEbass(a) as Record<string, unknown>).semi = 'x';
    expect(() => parseSongFile(a)).toThrow(/ebass.*semi/);
    const b = load();
    delete firstEbass(b).dur;
    expect(() => parseSongFile(b)).toThrow(/ebass.*dur/);
    const c = load();
    firstEbass(c).glide = 'up';
    expect(() => parseSongFile(c)).toThrow(/ebass.*glide/);
    const d = load();
    firstEbass(d).extra = 1;
    expect(() => parseSongFile(d)).toThrow(/ebass/);
  });
});
