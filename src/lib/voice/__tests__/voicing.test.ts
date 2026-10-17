import { describe, it, expect } from 'vitest';
import { modelOutputToNotes, DEFAULT_PITCH_SETTINGS, ANNOTATIONS_FPS, PITCH_SAMPLE_RATE, midiToHz, type PitchModelOutput } from '../pitchNotes';

/**
 * Shapes measured on real hummed takes (debug report 2026-10-17): a ~65 Hz
 * hum in the mic noise floor that the model reads as MIDI 36 notes, next to a
 * sung A#3 the model reads at 46 and 58. The gate keeps only the sung span;
 * octave choice is no longer this path's job (it stays polyphonic).
 */
const SECONDS = 3;
const FRAMES = SECONDS * ANNOTATIONS_FPS;

interface ModelNote { start: number; end: number; midi: number; frame: number; onset: number }

function modelOutput(notes: readonly ModelNote[], onsetsAt: readonly { frame: number; midi: number }[] = []): PitchModelOutput {
  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];
  for (let f = 0; f < FRAMES; f++) {
    const fr = new Array(88).fill(0);
    const on = new Array(88).fill(0);
    for (const n of notes) {
      if (f >= n.start && f < n.end) fr[n.midi - 21] = n.frame;
      if (f === n.start) on[n.midi - 21] = n.onset;
    }
    for (const o of onsetsAt) if (f === o.frame) on[o.midi - 21] = 0.6;
    frames.push(fr);
    onsets.push(on);
    contours.push(new Array(264).fill(0));
  }
  return { frames, onsets, contours };
}

/** Room hum everywhere, plus a harmonic-rich voice at `voiceHz` over [fromS, toS). */
function takeAudio(voiceHz: number, fromS: number, toS: number): Float32Array {
  const audio = new Float32Array(SECONDS * PITCH_SAMPLE_RATE);
  for (let i = 0; i < audio.length; i++) {
    const t = i / PITCH_SAMPLE_RATE;
    audio[i] = 0.004 * Math.sin(2 * Math.PI * 65 * t);
    if (t >= fromS && t < toS) {
      for (let h = 1; h <= 4; h++) audio[i] += (0.2 / h) * Math.sin(2 * Math.PI * voiceHz * h * t);
    }
  }
  return audio;
}

const hummedTake = (): PitchModelOutput => ({
  ...modelOutput([
    { start: 10, end: 40, midi: 36, frame: 0.5, onset: 0.6 },
    { start: 86, end: 172, midi: 46, frame: 0.65, onset: 0.7 },
    { start: 86, end: 172, midi: 58, frame: 0.47, onset: 0.55 },
  ]),
  audio: takeAudio(midiToHz(58), 1, 2),
});

describe('voice gate on Basic Pitch notes (owner report 2026-10-17)', () => {
  it('drops notes in the silent gaps where only the room hum is', () => {
    const notes = modelOutputToNotes(hummedTake(), DEFAULT_PITCH_SETTINGS);
    expect(notes.map((n) => n.pitchMidi)).toEqual([46, 58]);
    for (const n of notes) expect(n.startTimeSeconds).toBeGreaterThan(0.9);
  });

  it('keeps one held note when the model fires a second onset inside it', () => {
    const out = modelOutput([{ start: 86, end: 172, midi: 58, frame: 0.6, onset: 0.7 }], [{ frame: 130, midi: 58 }]);
    const notes = modelOutputToNotes({ ...out, audio: takeAudio(midiToHz(58), 1, 2) }, DEFAULT_PITCH_SETTINGS);
    expect(notes).toHaveLength(1);
    expect(notes[0].durationSeconds).toBeGreaterThan(0.9);
  });

  it('without audio (model output alone) nothing is gated or moved', () => {
    const { audio: _unused, ...modelOnly } = hummedTake();
    void _unused;
    const notes = modelOutputToNotes(modelOnly, DEFAULT_PITCH_SETTINGS);
    expect(notes.map((n) => n.pitchMidi)).toEqual([36, 46, 58]);
  });
});
