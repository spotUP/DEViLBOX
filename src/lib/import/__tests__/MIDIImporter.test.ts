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
