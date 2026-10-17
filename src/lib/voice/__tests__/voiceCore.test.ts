import { describe, it, expect, beforeEach } from 'vitest';
import { toMonophonic, transposeNotes, modelOutputToNotes, DEFAULT_PITCH_SETTINGS, ANNOTATIONS_FPS, type VoiceNote } from '../pitchNotes';
import { quantiseNotes, rowSeconds, type QuantiseSettings } from '../quantise';
import { mergeWindowNotes } from '../liveWindow';
import { VoiceRecorder, type VoiceCapture } from '../voiceRecorder';
import { applyNotesToPattern, NOTE_OFF, velocityToVolume } from '../writeToPattern';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { resetStore } from '@/stores/__tests__/_harness';
import { sungTakeModelOutput, SUNG_TAKE_PITCHES } from './sungTakeFixture';

const note = (start: number, dur: number, midi: number, amp = 0.8): VoiceNote => ({
  startTimeSeconds: start,
  durationSeconds: dur,
  pitchMidi: midi,
  amplitude: amp,
});

describe('pitchNotes', () => {
  it('toMonophonic keeps the strongest of overlapping notes and never overlaps', () => {
    const out = toMonophonic([note(0, 1, 60, 0.5), note(0.5, 1, 64, 0.9), note(2, 0.5, 67, 0.4)]);
    expect(out.map((n) => n.pitchMidi)).toEqual([64, 67]);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].startTimeSeconds).toBeGreaterThanOrEqual(out[i - 1].startTimeSeconds + out[i - 1].durationSeconds);
    }
  });

  it('transposeNotes shifts pitch only', () => {
    const [n] = transposeNotes([note(1, 0.5, 60)], 7);
    expect(n.pitchMidi).toBe(67);
    expect(n.startTimeSeconds).toBe(1);
  });

  it('modelOutputToNotes turns synthetic frames into one note at the right time and pitch', () => {
    const frames: number[][] = [];
    const onsets: number[][] = [];
    const contours: number[][] = [];
    const total = Math.round(ANNOTATIONS_FPS * 1);
    for (let f = 0; f < total; f++) {
      const on = f >= 10 && f < 60;
      const fr = new Array(88).fill(0);
      const on_ = new Array(88).fill(0);
      if (on) fr[60 - 21] = 0.9;
      if (f === 10) on_[60 - 21] = 0.9;
      frames.push(fr);
      onsets.push(on_);
      contours.push(new Array(264).fill(0));
    }
    const notes = modelOutputToNotes({ frames, onsets, contours }, DEFAULT_PITCH_SETTINGS, true);
    expect(notes).toHaveLength(1);
    expect(notes[0].pitchMidi).toBe(60);
    expect(notes[0].startTimeSeconds).toBeCloseTo(10 / ANNOTATIONS_FPS, 2);
  });

  it('default thresholds keep every note of a sung take (voice-level confidence)', () => {
    // The old 0.55 / 0.45 defaults returned zero of these three notes.
    const notes = modelOutputToNotes(sungTakeModelOutput(), DEFAULT_PITCH_SETTINGS, true);
    expect(notes.map((n) => n.pitchMidi)).toEqual(SUNG_TAKE_PITCHES);
  });
});

describe('quantiseNotes', () => {
  const base: QuantiseSettings = { bpm: 150, speed: 6, swing: 0, minLengthRows: 1, latencyNudgeMs: 0 };

  it('row length is speed * 2.5 / bpm', () => {
    expect(rowSeconds(150, 6)).toBeCloseTo(0.1, 6);
  });

  it('snaps to rows, rows strictly increase, no overlaps, lengths clipped to the next start', () => {
    const notes = [note(0.01, 0.62, 60), note(0.5, 0.3, 64), note(0.52, 0.2, 65, 0.3), note(1.0, 0.04, 67)];
    const q = quantiseNotes(notes, base);
    for (let i = 1; i < q.length; i++) {
      expect(q[i].row).toBeGreaterThan(q[i - 1].row);
      expect(q[i - 1].row + q[i - 1].lengthRows).toBeLessThanOrEqual(q[i].row);
    }
    expect(q[0]).toMatchObject({ row: 0, midi: 60 });
    // The louder of the colliding pair wins
    expect(q.find((n) => n.row === 5)?.midi).toBe(64);
    for (const n of q) expect(n.lengthRows).toBeGreaterThanOrEqual(1);
  });

  it('a positive latency nudge moves notes earlier', () => {
    const plain = quantiseNotes([note(0.5, 0.3, 60)], base);
    const nudged = quantiseNotes([note(0.5, 0.3, 60)], { ...base, latencyNudgeMs: 200 });
    expect(plain[0].row).toBe(5);
    expect(nudged[0].row).toBe(3);
  });

  it('swing delays odd rows', () => {
    const q = quantiseNotes([note(0.14, 0.05, 60)], { ...base, swing: 1 });
    // Straight grid: nearest row to 0.14 s is 1 (0.1 s). With full swing row 1 sits at 0.15 s: still row 1.
    expect(q[0].row).toBe(1);
    const q2 = quantiseNotes([note(0.19, 0.05, 60)], { ...base, swing: 1 });
    // Straight: row 2 (0.2). Swung: row 1 at 0.15 is 0.04 away, row 2 at 0.2 is 0.01 away.
    expect(q2[0].row).toBe(2);
  });
});

describe('liveWindow.mergeWindowNotes', () => {
  it('keeps settled notes and replaces everything from the window start on', () => {
    const prev = [note(0, 0.4, 60), note(1.0, 0.4, 62)];
    const merged = mergeWindowNotes(prev, [note(0.1, 0.3, 64)], 1.0);
    expect(merged.map((n) => n.pitchMidi)).toEqual([60, 64]);
    expect(merged[1].startTimeSeconds).toBeCloseTo(1.1, 6);
  });
});

describe('VoiceRecorder count-in', () => {
  it('drops the samples recorded during the count-in, so sample 0 of the take is beat 1', async () => {
    let deliver: (b: Float32Array) => void = () => {};
    const clicks: number[] = [];
    const capture: VoiceCapture = {
      sampleRate: 1000,
      start: async (cb) => { deliver = cb; },
      click: (d) => { clicks.push(d); },
      stop: () => {},
    };
    let started = 0;
    const rec = new VoiceRecorder(capture, { countInBeats: 2, beatSeconds: 0.5, onTakeStart: () => { started++; } });
    await rec.start();
    expect(clicks).toEqual([0, 0.5]);
    deliver(new Float32Array(900).fill(0.1)); // count-in (1000 samples long)
    expect(started).toBe(0);
    deliver(new Float32Array(300).fill(0.5)); // 100 more count-in + 200 take
    const take = rec.stop();
    expect(started).toBe(1);
    expect(take.length).toBe(200);
    expect(take[0]).toBe(0.5);
  });
});

describe('applyNotesToPattern', () => {
  beforeEach(() => resetStore(useTrackerStore));

  it('writes note, instrument, volume and a note-off, clears the span, counts drops', () => {
    const pattern = structuredClone(useTrackerStore.getState().patterns[0]);
    pattern.channels[0].rows[2].note = 40;
    const len = pattern.channels[0].rows.length;
    const res = applyNotesToPattern(
      pattern,
      [
        { row: 0, lengthRows: 2, midi: 60, velocity: 1 },
        { row: len, lengthRows: 1, midi: 62, velocity: 1 },
      ],
      { channelIndex: 0, startRow: 0, instrumentId: 3 },
    );
    const rows = pattern.channels[0].rows;
    expect(res).toEqual({ written: 1, dropped: 1 });
    expect(rows[0].note).toBeGreaterThan(0);
    expect(rows[0].instrument).toBe(3);
    expect(rows[0].volume).toBe(velocityToVolume(1));
    expect(rows[2].note).toBe(NOTE_OFF);
  });
});


import { snapMidiToKey, snapNotesToKey } from '../scaleSnap';
import { detectClickOnset, getStoredLatencyMs, storeLatencyMs, measureLoopbackLatencyMs, LATENCY_STORAGE_KEY } from '../latencyCalibration';
import { addTake, listTakes, clearTakes, MAX_TAKES } from '../takeHistory';

describe('scaleSnap', () => {
  it('snaps to the nearest key note, ties go lower', () => {
    const cMajor = { tonic: 0, scale: 'major' as const };
    expect(snapMidiToKey(60, cMajor)).toBe(60);
    expect(snapMidiToKey(61, cMajor)).toBe(60); // tie C#: lower
    expect(snapMidiToKey(63, cMajor)).toBe(62); // D#: tie, lower
    expect(snapMidiToKey(66, cMajor)).toBe(65); // F#: tie, lower
    expect(snapMidiToKey(61, { tonic: 2, scale: 'minor' })).toBe(60); // D minor: C# to C (no C#)
    expect(snapMidiToKey(70, { tonic: 0, scale: 'pentatonicMajor' })).toBe(69);
    expect(snapNotesToKey([note(0, 1, 61)], cMajor)[0].pitchMidi).toBe(60);
  });
});

describe('latency calibration', () => {
  it('detectClickOnset finds a click at known offsets', () => {
    for (const ms of [0, 37, 120, 410]) {
      const buf = new Float32Array(22050);
      const at = Math.round((ms / 1000) * 22050);
      for (let i = 0; i < 30; i++) buf[at + i] = 0.7;
      const t = detectClickOnset(buf, 22050);
      expect(t).not.toBeNull();
      expect(Math.abs((t as number) * 1000 - ms)).toBeLessThan(1);
    }
    expect(detectClickOnset(new Float32Array(1000), 22050)).toBeNull();
  });

  it('stores the offset per device under the versioned key', () => {
    localStorage.removeItem(LATENCY_STORAGE_KEY);
    storeLatencyMs('mic-a', 80);
    storeLatencyMs('', 20);
    expect(getStoredLatencyMs('mic-a')).toBe(80);
    expect(getStoredLatencyMs('')).toBe(20);
    expect(getStoredLatencyMs('mic-b')).toBe(0);
    localStorage.removeItem(LATENCY_STORAGE_KEY);
  });

  it('measureLoopbackLatencyMs reports null when no click arrives', async () => {
    let deliver: (b: Float32Array) => void = () => {};
    const cap = {
      sampleRate: 22050,
      start: async (cb: (b: Float32Array) => void) => { deliver = cb; },
      click: () => { setTimeout(() => deliver(new Float32Array(22050)), 0); },
      stop: () => {},
    };
    expect(await measureLoopbackLatencyMs(cap)).toBeNull();
  });
});

describe('takeHistory', () => {
  it('keeps the newest 8', () => {
    clearTakes();
    for (let i = 0; i < 11; i++) addTake({ frames: [], onsets: [], contours: [] }, i);
    expect(listTakes().length).toBe(MAX_TAKES);
    expect(listTakes()[0].seconds).toBe(10);
    clearTakes();
  });
});
