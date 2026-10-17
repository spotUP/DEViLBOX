/**
 * The effects Voice to Notes hears on a take (VNR-14). The audio is
 * synthesised here (sines with a glide, a wobble, a fade) at the pitch
 * model's 22050 Hz, so no audio files are needed.
 */
import { describe, it, expect } from 'vitest';
import { ALL_EFFECTS, arpeggiateNotes, melodyRows, noteDelayEffect, takeContour } from '../noteEffects';
import { quantiseHits, defaultDrumMap } from '../drumToNotes';
import { midiToHz, PITCH_SAMPLE_RATE, type VoiceNote } from '../pitchNotes';
import type { QuantiseSettings, QuantisedNote } from '../quantise';
import { voiceEffectSet, type VoiceEffect } from '../voiceEffects';
import { takeCells } from '../writeToPattern';
import type { DrumHit, HitFeatures } from '../drumHits';
import { midiToXMNote } from '@/lib/xmConversions';

const SR = PITCH_SAMPLE_RATE;
const Q: QuantiseSettings = { bpm: 125, speed: 6, swing: 0, minLengthRows: 1, latencyNudgeMs: 0, strength: 1, toleranceRows: 0.1 };
const ROW = 0.12; // seconds per row at 125 BPM, speed 6
const LEAD = 0.1; // silence before the sung note, as a real take has

/** A sine whose pitch and level follow the given curves, with silence either side. */
function synth(seconds: number, midiAt: (t: number) => number, ampAt: (t: number) => number = () => 0.6): Float32Array {
  const out = new Float32Array(Math.round((seconds + 2 * LEAD) * SR));
  let phase = 0;
  const from = Math.round(LEAD * SR);
  for (let i = 0; i < Math.round(seconds * SR); i++) {
    const t = i / SR;
    phase += (2 * Math.PI * midiToHz(midiAt(t))) / SR;
    out[from + i] = ampAt(t) * Math.sin(phase);
  }
  return out;
}

const sung = (startSeconds: number, seconds: number, midi: number): VoiceNote => ({
  startTimeSeconds: startSeconds,
  durationSeconds: seconds,
  pitchMidi: midi,
  amplitude: 0.8,
});

function rowsOf(audio: Float32Array, notes: VoiceNote[], toggles = ALL_EFFECTS): QuantisedNote[] {
  return melodyRows(notes, Q, { audio, sampleRate: SR }, takeContour(audio, SR), toggles);
}

const kinds = (n: QuantisedNote, kind: VoiceEffect['kind']) => (n.effects ?? []).filter((e) => e.kind === kind);

describe('Voice to Notes hears tracker effects on a take (VNR-14)', () => {
  it('a glide becomes the start note with a tone portamento to the note it reached', () => {
    // C-4 for one row, glide up to E-4 over two rows, hold E-4 two rows.
    const glide = synth(5 * ROW, (t) => (t < ROW ? 60 : t < 3 * ROW ? 60 + (4 * (t - ROW)) / (2 * ROW) : 64));
    const [note] = rowsOf(glide, [sung(LEAD, 5 * ROW, 64)]);
    expect(note.midi).toBe(60);
    const porta = kinds(note, 'tonePorta');
    expect(porta.length).toBeGreaterThanOrEqual(1);
    expect(porta[0]).toMatchObject({ rowOffset: 1, midi: 64 });
    expect(new Set(porta.map((e) => e.param)).size).toBe(1);
    expect(porta.every((e) => e.rowOffset >= 1 && e.rowOffset < 5)).toBe(true);
    expect(kinds(note, 'vibrato')).toEqual([]);

    const [plain] = rowsOf(glide, [sung(LEAD, 5 * ROW, 64)], { ...ALL_EFFECTS, slides: false });
    expect(plain.midi).toBe(64);
    expect(kinds(plain, 'tonePorta')).toEqual([]);
  });

  it('a wobble becomes vibrato on every row of the note, rate x and depth y from the voice', () => {
    // 5 Hz, one semitone deep: x = 5 Hz * 64 / 50 ticks per second = 6, y = 8.
    const wobble = synth(5 * ROW, (t) => 60 + Math.sin(2 * Math.PI * 5 * t));
    const [note] = rowsOf(wobble, [sung(LEAD, 5 * ROW, 60)]);
    expect(note.midi).toBe(60);
    const vibrato = kinds(note, 'vibrato');
    expect(vibrato.map((e) => e.rowOffset)).toEqual([0, 1, 2, 3, 4]);
    expect(vibrato[0].param).toBe(0x68);
    expect(kinds(note, 'tonePorta')).toEqual([]);
    expect(kinds(rowsOf(wobble, [sung(LEAD, 5 * ROW, 60)], { ...ALL_EFFECTS, vibrato: false })[0], 'vibrato')).toEqual([]);
  });

  it('a fade becomes a volume slide down on the rows after the note', () => {
    // 20 dB down over five rows.
    const fade = synth(5 * ROW, () => 60, (t) => 0.8 * Math.pow(10, -t / (5 * ROW)));
    const [note] = rowsOf(fade, [sung(LEAD, 5 * ROW, 60)]);
    const slide = kinds(note, 'volumeSlide');
    expect(slide.map((e) => e.rowOffset)).toEqual([1, 2, 3, 4]);
    expect(slide[0].param & 0xf0).toBe(0);
    expect(slide[0].param & 0x0f).toBeGreaterThanOrEqual(1);
    expect(kinds(note, 'vibrato')).toEqual([]);
    expect(kinds(note, 'tonePorta')).toEqual([]);
    expect(kinds(rowsOf(fade, [sung(LEAD, 5 * ROW, 60)], { ...ALL_EFFECTS, volume: false })[0], 'volumeSlide')).toEqual([]);
  });

  it('a steady note gets no effect', () => {
    const steady = synth(5 * ROW, () => 60);
    const [note] = rowsOf(steady, [sung(LEAD, 5 * ROW, 60)]);
    expect(note.midi).toBe(60);
    expect(note.effects ?? []).toEqual([]);
  });

  it('a note sung late keeps the offset the strength leaves as a note delay', () => {
    // A third of a row late at speed 6: 2 ticks at strength 0, none at strength 1.
    const late = [sung(4 * ROW + 0.04, 2 * ROW, 60)];
    const [note] = melodyRows(late, { ...Q, strength: 0 }, null, null, ALL_EFFECTS);
    expect(note.row).toBe(4);
    expect(note.effects).toEqual([{ kind: 'noteDelay', param: 2, rowOffset: 0 }]);
    const [half] = melodyRows(late, { ...Q, strength: 0.5 }, null, null, ALL_EFFECTS);
    expect(half.effects).toEqual([{ kind: 'noteDelay', param: 1, rowOffset: 0 }]);
    expect(melodyRows(late, Q, null, null, ALL_EFFECTS)[0].effects ?? []).toEqual([]);
    expect(noteDelayEffect(-0.3, 6)).toBeNull();
    expect(noteDelayEffect(0.9, 6)).toEqual({ kind: 'noteDelay', param: 5, rowOffset: 0 });
    expect(noteDelayEffect(0.5, 1)).toBeNull();
  });

  it('three quick notes inside a row fold into one arpeggio', () => {
    const notes = [sung(0, 0.03, 60), sung(0.03, 0.03, 64), sung(0.06, 0.03, 67), sung(2 * ROW, ROW, 62)];
    const folded = arpeggiateNotes(notes, Q);
    expect(folded).toHaveLength(2);
    expect(folded[0]).toMatchObject({ pitchMidi: 60, effects: [{ kind: 'arpeggio', param: 0x47, rowOffset: 0 }] });
    const rows = melodyRows(notes, Q, null, null, ALL_EFFECTS);
    expect(rows[0]).toMatchObject({ row: 0, midi: 60 });
    expect(kinds(rows[0], 'arpeggio')).toEqual([{ kind: 'arpeggio', param: 0x47, rowOffset: 0 }]);
    expect(kinds(melodyRows(notes, Q, null, null, { ...ALL_EFFECTS, arpeggio: false })[0], 'arpeggio')).toEqual([]);
  });

  it('two drum hits inside a row become a flam: the first hit with a retrigger', () => {
    const hit = (drum: DrumHit['drum'], timeSeconds: number, strength: number): DrumHit => ({ timeSeconds, drum, strength, features: {} as HitFeatures });
    const map = defaultDrumMap([]);
    // 0.04 s apart = 2 ticks at 125 BPM.
    const flam = quantiseHits([hit('kick', 0.3, 1), hit('kick', 0.34, 0.5)], map, Q);
    expect(flam).toHaveLength(1);
    expect(kinds(flam[0], 'retrigger')).toEqual([{ kind: 'retrigger', param: 2, rowOffset: 0 }]);
    const noFlam = quantiseHits([hit('kick', 0.3, 1), hit('kick', 0.34, 0.5)], map, Q, false);
    expect(noFlam.every((n) => kinds(n, 'retrigger').length === 0)).toBe(true);
  });

  it('takeCells writes the effect columns and the tone-portamento target note', () => {
    const note: QuantisedNote = {
      row: 0,
      offsetRows: 0,
      heardSeconds: 0,
      lengthRows: 4,
      midi: 60,
      velocity: 0.8,
      effects: [
        { kind: 'noteDelay', param: 2, rowOffset: 0 },
        { kind: 'tonePorta', param: 6, rowOffset: 1, midi: 64 },
        { kind: 'tonePorta', param: 6, rowOffset: 2 },
      ],
    };
    const target = { channelIndex: 0, startRow: 0, instrumentId: 1 };
    const { cells } = takeCells([note], target, 8);
    expect(cells[0]).toMatchObject({ note: midiToXMNote(60), instrument: 1, effects: [{ effTyp: 0xe, eff: 0xd2 }] });
    expect(cells[1]).toMatchObject({ note: midiToXMNote(64), instrument: 0, effects: [{ effTyp: 0x3, eff: 6 }] });
    expect(cells[2]).toMatchObject({ note: 0, effects: [{ effTyp: 0x3, eff: 6 }] });
    expect(cells[3].effects).toEqual([]);

    const furnace = takeCells([note], target, 8, voiceEffectSet('furnace', 1)).cells;
    expect(furnace[0].effects).toEqual([{ effTyp: 0xed, eff: 2 }]);
    expect(furnace[1].effects).toEqual([{ effTyp: 0x03, eff: 6 }]);
  });

  it('a slide row never runs into the next note', () => {
    const first: QuantisedNote = {
      row: 0, offsetRows: 0, heardSeconds: 0, lengthRows: 4, midi: 60, velocity: 0.8,
      effects: [{ kind: 'tonePorta', param: 6, rowOffset: 2, midi: 64 }, { kind: 'tonePorta', param: 6, rowOffset: 3 }],
    };
    const second: QuantisedNote = { row: 2, offsetRows: 0, heardSeconds: 2 * ROW, lengthRows: 1, midi: 67, velocity: 0.8 };
    const { cells } = takeCells([first, second], { channelIndex: 0, startRow: 0, instrumentId: 1 }, 8);
    expect(cells[2]).toMatchObject({ note: midiToXMNote(67), effects: [] });
    expect(cells[3].effects).toEqual([]);
  });
});
