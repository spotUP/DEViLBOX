import { describe, expect, it } from 'vitest';
import fixture from './fixtures/e6.uprough-song.json';
import { FILE_VOICES, MELODY_TIMBRE_SOFTSYNTH, parseSongFile, songBassCut, songMelodyVoice, softsynthOfFileVoice, songFileToSong, songToSongFile, type SongFileDoc } from '../songFile';

const load = (): SongFileDoc => structuredClone(fixture) as unknown as SongFileDoc;

describe('song file round trip', () => {
  it('e6 sample: export(import(f)) deep-equals f', () => {
    const f = load();
    const song = songFileToSong(parseSongFile(structuredClone(f)));
    expect(song.patterns).toHaveLength(6);
    expect(song.patterns[0]!.channels.find((c) => c.id === 'kick')!.rows[0]!.note).toBeGreaterThan(0);
    expect(songToSongFile(song)).toEqual(f);
  });

  it('mutated copy (edited cells, extra lane, empty lane) round trips', () => {
    const f = load();
    const sec = f.sections[1]!;
    sec.lanes.perc2 = Array.from({ length: (sec.header.bars as number) * 16 }, (_, r) => (r === 4 ? ['C-4', 6, 40, null] : null));
    sec.bars[0]!.order.push('perc2:4');
    const song = songFileToSong(parseSongFile(structuredClone(f)));
    expect(songToSongFile(song)).toEqual(f);
  });

  it('schema 3: the groove row round trips verbatim and a file without song.groove is refused', () => {
    const f = load();
    expect(f.schema).toBe(3);
    expect(f.song.groove).toEqual({ swing: 0, micro: { kick: 0, snare: 1, ch: 3, ghost: -3, perc: 4, chop: 2 }, vel: 1 });
    const out = songToSongFile(songFileToSong(parseSongFile(structuredClone(f))));
    expect(JSON.stringify(out)).toBe(JSON.stringify(f));
    expect(Object.keys(out.song).slice(5, 10)).toEqual(['speed', 'groove', 'bass_cut', 'melody_voice', 'rate']);
    const g = load();
    delete g.song.groove;
    expect(() => parseSongFile(g)).toThrow(/Missing field "song\.groove" in Up Rough song file schema 3\./);
  });

  it('schema 3: song.bass_cut round trips and a file without it or with a non-number is refused', () => {
    const f = load();
    expect(songBassCut(parseSongFile(structuredClone(f)).song)).toBe(1);
    const g = load();
    delete g.song.bass_cut;
    expect(() => parseSongFile(g)).toThrow(/Missing field "song\.bass_cut" in Up Rough song file schema 3\./);
    const h = load();
    h.song.bass_cut = '0.8';
    expect(() => parseSongFile(h)).toThrow(/Song field "bass_cut" is "0\.8", not a positive number\./);
  });
  it('schema 3: song.melody_voice picks the softsynth the melody instrument plays, and exports back as "melody"', () => {
    expect(songMelodyVoice(parseSongFile(load()).song)).toBe('bell');
    const melodyIdx = (d: SongFileDoc): number => d.instruments.findIndex((i) => i.voice === 'melody');
    for (const [timbre, id] of Object.entries(MELODY_TIMBRE_SOFTSYNTH)) {
      const f = load();
      f.song.melody_voice = timbre;
      const song = songFileToSong(parseSongFile(f));
      expect(song.instruments[melodyIdx(f)]!.upRoughSoftsynth!.voice).toBe(id);
      expect(songToSongFile(song)).toEqual(f);
    }
    const lead = load();
    lead.song.melody_voice = 'lead';
    expect(songFileToSong(parseSongFile(lead)).instruments[melodyIdx(lead)]!.upRoughSoftsynth!.voice).toBe('melodyLead');
  });

  it('schema 3: a file without song.melody_voice or with an unknown timbre is refused', () => {
    const g = load();
    delete g.song.melody_voice;
    expect(() => parseSongFile(g)).toThrow(/Missing field "song\.melody_voice" in Up Rough song file schema 3\./);
    const h = load();
    h.song.melody_voice = 'kazoo';
    expect(() => parseSongFile(h)).toThrow(/Song field "melody_voice" is "kazoo", not a melody timbre the softsynth has/);
  });

  it('melody timbres map to distinct softsynth ids (no first-match collision) and a foreign melody voice is not exported as melody', () => {
    const ids = Object.values(MELODY_TIMBRE_SOFTSYNTH);
    expect(new Set(ids).size).toBe(ids.length);
    for (const timbre of Object.keys(MELODY_TIMBRE_SOFTSYNTH)) {
      const owners = FILE_VOICES.filter((v) => softsynthOfFileVoice(v, timbre) === MELODY_TIMBRE_SOFTSYNTH[timbre]);
      expect(owners).toEqual(['melody']);
    }
    const f = load();
    f.song.melody_voice = 'lead';
    const song = songFileToSong(parseSongFile(f));
    song.instruments[f.instruments.findIndex((i) => i.voice === 'melody')]!.upRoughSoftsynth!.voice = 'melodyBell';
    expect(() => songToSongFile(song)).toThrow(/uses voice "melodyBell"/);
  });
});
