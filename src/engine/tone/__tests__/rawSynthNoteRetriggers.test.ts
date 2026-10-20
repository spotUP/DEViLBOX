/**
 * Owner 2026-10-20: in a fresh song a Wobble Bass channel played its first note as a real attack and every later note
 * legato. A new raw note only released the old one: its release tail kept sounding under the new attack, and the new
 * attack started from the envelope's current value. FT2 semantics (owner decision): a raw note cuts the old note with
 * a few-millisecond ramp just before the new attack, and the envelopes start again from zero. A slide keeps the
 * current behaviour (no cut): the old note keeps sounding through its release.
 * Real Tone rendered offline (no device is opened).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';

let Tone: typeof import('tone');

beforeAll(async () => {
  installRealWebAudio();
  Tone = await import('tone');
}, 60000);

const ROW = 0.12;
const NOTES: Array<[number, string]> = [[0, 'D4'], [4, 'G4'], [8, 'C5'], [12, 'B4']];
const at = (row: number) => 0.05 + row * ROW;

async function render(cut: boolean, attackNew = true) {
  const { createWobbleBass } = await import('../../factories/CommunitySynthFactory');
  const { cutToneNote } = await import('../toneNoteCut');
  const { DEFAULT_WOBBLE_BASS } = await import('@/types/instrument/defaults');
  const buf = await Tone.Offline(() => {
    const cfg = { ...DEFAULT_WOBBLE_BASS, envelope: { attack: 5, decay: 200, sustain: 80, release: 300 } };
    const wb = createWobbleBass({ id: 1, synthType: 'WobbleBass', wobbleBass: cfg } as never) as unknown as {
      connect: (d: unknown) => void;
      triggerAttack: (n: string, t: number, v: number) => void;
      triggerRelease: (n: string, t: number) => void;
    };
    wb.connect(Tone.getDestination());
    let prev: string | null = null;
    for (const [row, note] of NOTES) {
      const t = at(row);
      if (prev) {
        wb.triggerRelease(prev, t);
        if (cut) cutToneNote(wb, t);
      }
      if (attackNew || !prev) wb.triggerAttack(note, t + 0.0005, 1);
      prev = note;
    }
  }, at(16));
  const d = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const rms = (a: number, b: number) => {
    let s = 0;
    const i0 = Math.floor(a * sr), i1 = Math.floor(b * sr);
    for (let i = i0; i < i1; i++) s += d[i] * d[i];
    return Math.sqrt(s / Math.max(1, i1 - i0));
  };
  return { rms };
}

describe('raw synth note on a channel that is already playing', () => {
  // The old note is rendered on its own (no new attack): with the cut its tail is gone a few milliseconds after the
  // new note's time, without the cut its 300 ms release keeps sounding under the new note.
  it('cuts the old note so its tail does not sound under the new note', async () => {
    const { rms } = await render(true, false);
    const t = at(NOTES[1][0]);
    const sounding = rms(t - 0.03, t - 0.01);
    expect(sounding).toBeGreaterThan(0.05);
    expect(rms(t + 0.01, t + 0.03)).toBeLessThan(sounding * 0.02);
  }, 60000);

  it('keeps the old note sounding through its release when the note slides (no cut)', async () => {
    const { rms } = await render(false, false);
    const t = at(NOTES[1][0]);
    const sounding = rms(t - 0.03, t - 0.01);
    expect(rms(t + 0.01, t + 0.03)).toBeGreaterThan(sounding * 0.5);
  }, 60000);

  it('still plays every new note after a cut', async () => {
    const { rms } = await render(true);
    for (const [row] of NOTES.slice(1)) {
      const t = at(row);
      expect(rms(t + 0.01, t + 0.03)).toBeGreaterThan(0.05);
    }
  }, 60000);
});
