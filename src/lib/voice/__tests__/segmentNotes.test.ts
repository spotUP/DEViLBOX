import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SEGMENT_SETTINGS, segmentFrames, segmentNotes, type SegmentSettings } from '../segmentNotes';
import { TRACK_HOP_SECONDS, midiToHz, type F0Track } from '../pitchTrack';

interface Run { hz: number; frames: number; confidence?: number; db?: number }

/** A track from runs of frames; defaults: confidence 0.95, -20 dB. */
function track(runs: Run[]): F0Track {
  const n = runs.reduce((s, r) => s + r.frames, 0);
  const t: F0Track = { hz: new Float32Array(n), confidence: new Float32Array(n), loudnessDb: new Float32Array(n), hopSeconds: TRACK_HOP_SECONDS };
  let i = 0;
  for (const r of runs) {
    for (let k = 0; k < r.frames; k++, i++) {
      t.hz[i] = r.hz;
      t.confidence[i] = r.confidence ?? 0.95;
      t.loudnessDb[i] = r.db ?? -20;
    }
  }
  return t;
}

const silence = (frames: number): Run => ({ hz: 100, frames, confidence: 0, db: -80 });
const A3 = midiToHz(57);
const Bb3 = midiToHz(58);
const pitches = (s: SegmentSettings, t: F0Track) => segmentNotes(t, s).map((n) => n.pitchMidi);

describe('segmentFrames matches swift_f0 segment_notes (parity fixtures)', () => {
  for (const name of ['alternating', 'glide']) {
    it(`${name}: same note boundaries (frame-exact) and MIDI numbers`, () => {
      const f = JSON.parse(readFileSync(join(__dirname, 'fixtures/swiftf0-parity', `${name}.json`), 'utf8')) as {
        hopSeconds: number; hz: number[]; confidence: number[]; loudnessDb: number[];
        notes: { startFrame: number; endFrame: number; midi: number }[];
      };
      const t: F0Track = { hz: Float32Array.from(f.hz), confidence: Float32Array.from(f.confidence), loudnessDb: Float32Array.from(f.loudnessDb), hopSeconds: f.hopSeconds };
      const ours = segmentFrames(t, 80, 0).map((n) => ({ startFrame: n.startFrame, endFrame: n.endFrame, midi: Math.floor(n.mu + 0.5) }));
      expect(ours).toEqual(f.notes.map(({ startFrame, endFrame, midi }) => ({ startFrame, endFrame, midi })));
    });
  }

  it('the alternating ooo/eee fixture is 6 notes A-3 C#4 A-3 C#4 A-3 C#4', () => {
    const f = JSON.parse(readFileSync(join(__dirname, 'fixtures/swiftf0-parity/alternating.json'), 'utf8')) as { notes: { midi: number }[] };
    expect(f.notes.map((n) => n.midi)).toEqual([57, 61, 57, 61, 57, 61]);
  });
});

describe('segmentNotes rules', () => {
  const s = DEFAULT_SEGMENT_SETTINGS;

  it('a vowel change at one pitch (confidence 0.95 then 0.6) is one note', () => {
    const notes = segmentNotes(track([silence(5), { hz: A3, frames: 20 }, { hz: A3, frames: 20, confidence: 0.6 }, silence(5)]), s);
    expect(notes.map((n) => n.pitchMidi)).toEqual([57]);
    expect(notes[0].durationSeconds).toBeCloseTo(40 * TRACK_HOP_SECONDS, 6);
  });

  it('a one-semitone step held 64 ms does not split; held 96 ms does', () => {
    expect(pitches(s, track([silence(5), { hz: A3, frames: 30 }, { hz: Bb3, frames: 4 }, silence(5)]))).toEqual([57]);
    expect(pitches(s, track([silence(5), { hz: A3, frames: 30 }, { hz: Bb3, frames: 6 }, silence(5)]))).toEqual([57, 58]);
  });

  it('a 60 ms unvoiced gap with a loudness dip (breath, consonant) splits two same-pitch notes', () => {
    expect(pitches(s, track([silence(5), { hz: A3, frames: 20 }, { hz: A3, frames: 4, confidence: 0.1, db: -30 }, { hz: A3, frames: 20 }, silence(5)]))).toEqual([57, 57]);
  });

  it('a 60 ms confidence dip at full loudness is a vowel change, not a gap: one note (VNR-17)', () => {
    expect(pitches(s, track([silence(5), { hz: A3, frames: 20 }, { hz: A3, frames: 4, confidence: 0.1 }, { hz: A3, frames: 20 }, silence(5)]))).toEqual([57]);
  });

  it('a voiced frame below the voicing threshold counts as unvoiced in the DP', () => {
    const t = track([silence(5), { hz: A3, frames: 20 }, { hz: A3, frames: 4, confidence: 0.4 }, { hz: A3, frames: 20 }, silence(5)]);
    expect(segmentFrames(t, s.pitchHoldMs, s.voicingThreshold)).toHaveLength(2);
    expect(segmentFrames(t, s.pitchHoldMs, 0)).toHaveLength(1);
  });

  it('a 2 dB loudness dip does not split; a 12 dB dip does', () => {
    const dip = (db: number) => track([silence(5), { hz: A3, frames: 20 }, { hz: A3, frames: 3, db: -20 - db }, { hz: A3, frames: 20 }, silence(5)]);
    expect(pitches(s, dip(2))).toEqual([57]);
    expect(pitches(s, dip(12))).toEqual([57, 57]);
  });

  it('drops notes shorter than minNoteLengthMs and outside the MIDI range', () => {
    const t = track([silence(5), { hz: A3, frames: 5 }, silence(10), { hz: midiToHz(40), frames: 20 }, silence(10), { hz: midiToHz(64), frames: 20 }, silence(5)]);
    expect(pitches({ ...s, pitchHoldMs: 0 }, t)).toEqual([40, 64]);
    expect(pitches({ ...s, pitchHoldMs: 0, minMidiNote: 48 }, t)).toEqual([64]);
    expect(pitches({ ...s, pitchHoldMs: 0, minNoteLengthMs: 0 }, t)).toEqual([57, 40, 64]);
  });

  it('a louder note gets a higher amplitude, normalised to the loudest', () => {
    const notes = segmentNotes(track([silence(5), { hz: A3, frames: 20, db: -10 }, silence(10), { hz: midiToHz(64), frames: 20, db: -30 }, silence(5)]), s);
    expect(notes).toHaveLength(2);
    expect(notes[0].amplitude).toBeCloseTo(1, 6);
    expect(notes[1].amplitude).toBeCloseTo(0.1, 6);
  });

  it('returns no notes for a track without a pitch', () => {
    expect(segmentNotes(track([{ hz: 0, frames: 20 }]), s)).toEqual([]);
  });

  it('times a 60 s take', () => {
    // A sung-like contour: notes over two octaves with vibrato, so every cent is a candidate.
    const n = Math.round(60 / TRACK_HOP_SECONDS);
    const t: F0Track = { hz: new Float32Array(n), confidence: new Float32Array(n), loudnessDb: new Float32Array(n), hopSeconds: TRACK_HOP_SECONDS };
    for (let i = 0; i < n; i++) {
      const midi = 48 + ((Math.floor(i / 25) * 7) % 24) + 0.3 * Math.sin(i / 3) + ((i * 7919) % 100) / 100 - 0.5;
      t.hz[i] = midiToHz(midi);
      t.confidence[i] = i % 25 < 2 ? 0.2 : 0.9;
      t.loudnessDb[i] = -20;
    }
    const t0 = performance.now();
    const notes = segmentNotes(t, s);
    const ms = performance.now() - t0;
    console.log(`[segmentNotes] 60 s take: ${n} frames, ${ms.toFixed(1)} ms, ${notes.length} notes`);
    expect(notes.length).toBeGreaterThan(0);
    // Budget 50 ms (plan SG-5; measured 24.5 ms on the owner's Mac); slack for slow CI runners.
    expect(ms).toBeLessThan(200);
  });

  it('ooo eee ooo eee on one pitch, confidence dipping to 0.3 at each vowel change, is one note (VNR-17)', () => {
    const runs: Run[] = [silence(5)];
    for (let k = 0; k < 6; k++) {
      runs.push({ hz: A3, frames: 25, db: k % 2 ? -18 : -22 });
      if (k < 5) runs.push({ hz: A3 * 1.01, frames: 3, confidence: 0.3, db: -21 });
    }
    runs.push(silence(5));
    const notes = segmentNotes(track(runs), s);
    expect(notes.map((n) => n.pitchMidi)).toEqual([57]);
    expect(notes[0].durationSeconds).toBeCloseTo((6 * 25 + 5 * 3) * TRACK_HOP_SECONDS, 6);
  });

  it('two sung notes as ooo/eee vowels stay two notes, not one per vowel (VNR-17)', () => {
    const runs: Run[] = [silence(5)];
    for (const hz of [A3, midiToHz(61)]) {
      for (let k = 0; k < 4; k++) {
        runs.push({ hz, frames: 20 });
        if (k < 3) runs.push({ hz, frames: 2, confidence: 0.25 });
      }
      runs.push(silence(8));
    }
    expect(pitches(s, track(runs))).toEqual([57, 61]);
  });

  it('a bright vowel that makes the tracker jump an octave for a few frames stays one note (VNR-17)', () => {
    const t = track([silence(5), { hz: A3, frames: 20 }, { hz: A3 * 2, frames: 7 }, { hz: A3, frames: 20 }, { hz: A3 / 2, frames: 6 }, { hz: A3, frames: 20 }, silence(5)]);
    expect(pitches(s, t)).toEqual([57]);
  });

  it('a sung octave leap held longer than the fold window keeps its pitch', () => {
    expect(pitches(s, track([silence(5), { hz: A3, frames: 30 }, { hz: A3 * 2, frames: 30 }, silence(5)]))).toEqual([57, 69]);
  });
});
