/**
 * MIDI import regression: two General MIDI reggae riddims whose ground truth
 * was dumped straight from the .mid bytes (thoughts/shared/research/
 * 2026-10-21_midi-importer-defects.md).  Drives the importer entry point the
 * dialog and the song loader use, and asserts the measured numbers: every
 * chord note survives on its own voice channel, track names and mixer CCs
 * survive the @tonejs/midi track split, the tempo keeps its decimals,
 * staccato notes keep their length (ECx), swung hits keep their offset (EDx).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Midi } from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import { importMIDIFile, MIDI_IMPORT_SPEED } from '@lib/import/MIDIImporter';
import type { ChannelData, TrackerCell } from '@typedefs/tracker';

const FIXTURES = resolve(__dirname, '../../../__tests__/fixtures/midi');

async function load(name: string) {
  const buf = readFileSync(resolve(FIXTURES, name));
  return importMIDIFile(new File([buf], name));
}

function channel(channels: ChannelData[], name: string): ChannelData {
  const ch = channels.find((c) => c.name === name);
  if (!ch) throw new Error(`channel "${name}" missing; have ${channels.map((c) => c.name).join(', ')}`);
  return ch;
}

const noteOns = (ch: ChannelData) => ch.rows.filter((r) => r.note > 0 && r.note < 97).length;
const noteOffs = (ch: ChannelData) => ch.rows.filter((r) => r.note === 97).length;
const voices = (channels: ChannelData[], prefix: string) =>
  channels.filter((c) => c.name === prefix || c.name.startsWith(`${prefix} `));
const hasEffect = (cell: TrackerCell, typ: number, param: number) =>
  (cell.effTyp === typ && cell.eff === param) || (cell.effTyp2 === typ && cell.eff2 === param);

describe('importMIDIFile on real General MIDI songs', () => {
  it('queen_majesty.mid keeps every chord note, the track names, tempo decimals and feel', async () => {
    const r = await load('queen_majesty.mid');
    expect(r.bpm).toBe(78.01);
    expect(r.speed).toBe(MIDI_IMPORT_SPEED);
    expect(r.patterns).toHaveLength(1);
    expect(r.patterns[0].length).toBe(32);
    const chs = r.patterns[0].channels;

    // Melodic tracks: one voice per simultaneous note, named after the MIDI track
    const bass = channel(chs, 'bass');
    expect(noteOns(bass)).toBe(24);
    expect(bass.rows[0].note).toBe(28); // MIDI 39 (D#1)
    expect(bass.rows[0].volume).toBe(0x50); // velocity 127
    // 62-tick note at speed 6 = 3 replayer ticks: ECx note cut, not a full-row legato note
    expect(hasEffect(bass.rows[0], 0xE, 0xC3)).toBe(true);

    const guitar = voices(chs, 'guitar chords');
    expect(guitar.map((c) => c.name)).toEqual(['guitar chords 1', 'guitar chords 2', 'guitar chords 3', 'guitar chords 4']);
    expect(guitar.reduce((n, c) => n + noteOns(c), 0)).toBe(32);
    expect(guitar.map((c) => c.rows[2].note).sort((a, b) => a - b)).toEqual([43, 47, 52, 55]); // MIDI 54 58 63 66
    expect(new Set(guitar.map((c) => c.instrumentId)).size).toBe(1);

    const organ = voices(chs, 'organ chords');
    expect(organ).toHaveLength(3);
    expect(organ.reduce((n, c) => n + noteOns(c), 0)).toBe(24);

    // Drums: one channel per GM note, GM2 names included
    expect(noteOns(channel(chs, 'Closed Hi-Hat'))).toBe(32);
    expect(noteOns(channel(chs, 'Castanets'))).toBe(12);
    expect(noteOns(channel(chs, 'Acoustic Bass Drum'))).toBe(10);
    expect(noteOns(channel(chs, 'Bass Drum 1'))).toBe(6);
    expect(noteOns(channel(chs, 'Side Stick'))).toBe(4);
    expect(noteOns(channel(chs, 'Hand Clap'))).toBe(8);
    expect(noteOns(channel(chs, 'Chinese Cymbal'))).toBe(4);
    // Offbeat hats are 18 ticks (0.9 replayer ticks) late: ED1 keeps the swing
    const hats = channel(chs, 'Closed Hi-Hat');
    expect(hasEffect(hats.rows[1], 0xE, 0xD1)).toBe(true);
    expect(hasEffect(hats.rows[0], 0xE, 0xD1)).toBe(false);

    expect(chs).toHaveLength(15);
    expect(r.instruments).toHaveLength(10);
  });

  it('cuss_cuss.mid keeps the five-note chords, CC 7 channel volume and note lengths', async () => {
    const r = await load('cuss_cuss.mid');
    expect(r.bpm).toBe(74.67);
    expect(r.patterns[0].length).toBe(16);
    const chs = r.patterns[0].channels;

    const bass = channel(chs, 'bass');
    expect(noteOns(bass)).toBe(13);
    expect(noteOffs(bass)).toBe(3);
    expect(bass.rows[0].note).toBe(27); // MIDI 38 (D1)
    expect(bass.rows[4].note).toBe(30); // MIDI 41
    // CC 7 = 126 and CC 10 = 64 before the first note are the mixer channel, not a row effect
    expect(bass.volume).toBe(99);
    expect(bass.pan).toBe(0);
    expect(bass.rows[0].effTyp).not.toBe(0xC);
    // Note at tick 135 (row 1.125) plays late by one replayer tick
    expect(hasEffect(bass.rows[1], 0xE, 0xD1)).toBe(true);

    const chorus = voices(chs, 'chorus delay');
    expect(chorus).toHaveLength(5);
    expect(chorus.reduce((n, c) => n + noteOns(c), 0)).toBe(29);
    expect(chorus.every((c) => c.rows[10].note > 0)).toBe(true);

    expect(noteOns(channel(chs, 'Closed Hi-Hat'))).toBe(16);
    expect(noteOns(channel(chs, 'Side Stick'))).toBe(2);
    expect(noteOns(channel(chs, 'Acoustic Bass Drum'))).toBe(6);
    expect(chs).toHaveLength(9);
  });

  it('quantize snaps notes to rows and drops the note delays', async () => {
    const buf = readFileSync(resolve(FIXTURES, 'queen_majesty.mid'));
    const r = await importMIDIFile(new File([buf], 'queen_majesty.mid'), { quantize: 1 });
    const hats = channel(r.patterns[0].channels, 'Closed Hi-Hat');
    expect(noteOns(hats)).toBe(32);
    expect(hats.rows.some((c) => (c.effTyp === 0xE && (c.eff & 0xF0) === 0xD0))).toBe(false);
  });
});

describe('importMIDIFile key re-struck on one MIDI channel', () => {
  // death_in_the_arena.mid: the chords track strikes 8 keys twice at the same tick
  // (43 note-ons, 35 distinct). A SoundFont synth re-strikes the key, so one voice
  // sounds; one channel per note-on played both, 6 dB too loud on those chords.
  it('death_in_the_arena.mid plays a doubled chord key once, on one channel', async () => {
    const r = await load('death_in_the_arena.mid');
    const chs = r.patterns[0].channels;
    const chords = voices(chs, 'chords');
    expect(chords.reduce((n, c) => n + noteOns(c), 0)).toBe(35);
    for (let row = 0; row < r.patterns[0].length; row++) {
      const keys = chords.map((c) => c.rows[row].note).filter((n) => n > 0 && n < 97);
      expect(new Set(keys).size, `row ${row}`).toBe(keys.length);
    }
  });
});

describe('importMIDIFile tempo map', () => {
  /** Quarter notes on every beat for `beats` beats; tempos = [beat, bpm][]. */
  async function build(tempos: Array<[number, number]>, beats: number) {
    const midi = new Midi();
    midi.header.setTempo(tempos[0][1]);
    midi.header.tempos.length = 0;
    for (const [beat, bpm] of tempos) midi.header.tempos.push({ ticks: beat * midi.header.ppq, bpm });
    const track = midi.addTrack();
    for (let b = 0; b < beats; b++) track.addNote({ midi: 60, ticks: b * midi.header.ppq, durationTicks: midi.header.ppq });
    const bytes = midi.toArray();
    return importMIDIFile(new File([new Uint8Array(bytes)], 'tempo.mid'));
  }

  const fxxCells = (r: Awaited<ReturnType<typeof importMIDIFile>>) => {
    const out: Array<{ row: number; param: number }> = [];
    let base = 0;
    for (const pat of r.patterns) {
      for (const ch of pat.channels) {
        ch.rows.forEach((c, i) => {
          if (c.effTyp === 0xF) out.push({ row: base + i, param: c.eff });
          if (c.effTyp2 === 0xF) out.push({ row: base + i, param: c.eff2 });
        });
      }
      base += pat.length;
    }
    return out.sort((a, b) => a.row - b.row);
  };

  it('120 -> 60 BPM at beat 8 writes F3C at row 32 and keeps 120 as the initial BPM', async () => {
    const r = await build([[0, 120], [8, 60]], 16);
    expect(r.bpm).toBe(120);
    expect(fxxCells(r)).toEqual([{ row: 32, param: 0x3C }]);
  });

  it('writes every later tempo change at its own row', async () => {
    const r = await build([[0, 100], [4, 140], [8, 90], [12, 200]], 16);
    expect(r.bpm).toBe(100);
    expect(fxxCells(r)).toEqual([
      { row: 16, param: 140 },
      { row: 32, param: 90 },
      { row: 48, param: 200 },
    ]);
  });

  it('a tempo below 32 BPM keeps the row duration by raising speed and BPM together', async () => {
    const r = await build([[0, 120], [4, 24]], 8);
    // 24 BPM at speed 6 == 32 BPM at speed 8 (same speed * 2.5 / BPM)
    expect(fxxCells(r)).toEqual([{ row: 16, param: 8 }, { row: 16, param: 32 }]);
  });
});

describe('importMIDIFile drum hits that share a row', () => {
  it('fade_away.mid keeps all 552 note-ons: two Low Tom hits in one row get an overflow voice', async () => {
    const buf = readFileSync(resolve(__dirname, '../../../../public/data/songs/midi/fade_away.mid'));
    const raw = new Midi(buf).tracks.reduce((n, t) => n + t.notes.length, 0);
    expect(raw).toBe(552);
    const r = await importMIDIFile(new File([buf], 'fade_away.mid'));
    let total = 0;
    for (const p of r.patterns) for (const ch of p.channels) total += noteOns(ch);
    expect(total).toBe(552);
    const lowTom = r.patterns.flatMap((p) => p.channels).filter((c) => c.name.startsWith('Low Tom'));
    expect(new Set(lowTom.map((c) => c.name))).toEqual(new Set(['Low Tom', 'Low Tom 2']));
  });
});

describe('importMIDIFile sound source', () => {
  const buf = () => readFileSync(resolve(FIXTURES, 'queen_majesty.mid'));

  it('defaults to the GM SoundFont: FluidSynth per track program, drums on bank 128 at their GM key', async () => {
    const r = await importMIDIFile(new File([buf()], 'queen_majesty.mid'));
    const chs = r.patterns[0].channels;
    const instOf = (ch: ChannelData) => r.instruments.find((i) => i.id === ch.instrumentId)!;

    const bass = instOf(channel(chs, 'bass'));
    expect(bass.synthType).toBe('FluidSynth');
    // The file names its tracks on separate name-only tracks; the bass notes carry program 34 (Electric Bass, pick).
    expect(bass.fluidsynth).toMatchObject({ program: 34, bank: 0, soundFont: 'gm' });

    const hats = channel(chs, 'Closed Hi-Hat');
    expect(instOf(hats).fluidsynth).toMatchObject({ bank: 128, soundFont: 'gm' });
    expect(instOf(hats).name).toBe('Closed Hi-Hat');
    // GM key 42 sounds the closed hi-hat; XM note = MIDI - 11.
    expect(hats.rows[0].note).toBe(42 - 11);
    expect(channel(chs, 'Chinese Cymbal').rows.find((c) => c.note > 0)!.note).toBe(52 - 11);
  });

  it("'synth' keeps the built-in synths and the fixed drum trigger note", async () => {
    const r = await importMIDIFile(new File([buf()], 'queen_majesty.mid'), { soundFont: 'synth' });
    const chs = r.patterns[0].channels;
    const instOf = (ch: ChannelData) => r.instruments.find((i) => i.id === ch.instrumentId)!;
    expect(instOf(channel(chs, 'bass')).synthType).not.toBe('FluidSynth');
    const hats = channel(chs, 'Closed Hi-Hat');
    expect(instOf(hats).synthType).not.toBe('FluidSynth');
    expect(hats.rows[0].note).toBe(61);
  });
});
