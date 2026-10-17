import { describe, it, expect, beforeEach } from 'vitest';
import { transposeNotes, modelOutputToNotes, melodyRange, noteName, DEFAULT_PITCH_SETTINGS, ANNOTATIONS_FPS, PITCH_SAMPLE_RATE, midiToHz, type VoiceNote } from '../pitchNotes';
import { quantiseNotes, rowSeconds, type QuantiseSettings } from '../quantise';
import { LIVE_WINDOW_SECONDS, mergeWindowNotes, previewStep } from '../liveWindow';
import { DEFAULT_SHAPING } from '../voiceToNotes';
import { SineReadingTracker } from './sineReadingTracker';
import { VoiceRecorder, type VoiceCapture } from '../voiceRecorder';
import { applyNotesToPattern, applyTakeToSong, planTakeSegments, takeRowsNeeded, NOTE_OFF, velocityToVolume, type TakeSong } from '../writeToPattern';
import type { Pattern } from '@typedefs';
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
  it('noteName names MIDI 60 C4 and 69 A4', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(69)).toBe('A4');
    expect(noteName(61)).toBe('C#4');
  });

  it('melodyRange widens the sung range by three semitones and raises a low voice an octave', () => {
    expect(melodyRange([])).toBeNull();
    expect(melodyRange([note(0, 0.4, 60), note(0.4, 0.4, 64), note(0.8, 0.4, 67)])).toEqual({ minMidiNote: 57, maxMidiNote: 70, transpose: 0 });
    expect(melodyRange([note(0, 0.4, 40), note(0.4, 0.4, 43), note(0.8, 0.4, 45)])).toEqual({ minMidiNote: 37, maxMidiNote: 48, transpose: 12 });
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
    const notes = modelOutputToNotes({ frames, onsets, contours }, DEFAULT_PITCH_SETTINGS);
    expect(notes).toHaveLength(1);
    expect(notes[0].pitchMidi).toBe(60);
    expect(notes[0].startTimeSeconds).toBeCloseTo(10 / ANNOTATIONS_FPS, 2);
  });

  it('default thresholds keep every note of a sung take (voice-level confidence)', () => {
    // The old 0.55 / 0.45 defaults returned zero of these three notes.
    const notes = modelOutputToNotes(sungTakeModelOutput(), DEFAULT_PITCH_SETTINGS);
    expect(notes.map((n) => n.pitchMidi)).toEqual(SUNG_TAKE_PITCHES);
  });
});

describe('quantiseNotes', () => {
  const base: QuantiseSettings = { bpm: 150, speed: 6, swing: 0, minLengthRows: 1, latencyNudgeMs: 0, strength: 1, toleranceRows: 0.1 };

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

  it('previewStep keeps the onset of a note the window would cut, so the ghost note starts where the commit puts it (VR-1)', async () => {
    const tone = (midi: number, from: number, to: number, out: Float32Array) => {
      const w = (2 * Math.PI * midiToHz(midi)) / PITCH_SAMPLE_RATE;
      for (let i = Math.round(from * PITCH_SAMPLE_RATE); i < Math.round(to * PITCH_SAMPLE_RATE); i++) out[i] = 0.5 * Math.sin(w * i);
    };
    const take = new Float32Array(3 * PITCH_SAMPLE_RATE);
    tone(60, 1.2, 2.2, take);
    tone(64, 2.3, 3.0, take);
    // The step at 2.0 s heard C4 from 1.2 s on; the window at 3.0 s starts mid-note
    expect(3 - LIVE_WINDOW_SECONDS).toBeGreaterThan(1.2);
    const earlier = await previewStep(take.subarray(0, 2 * PITCH_SAMPLE_RATE), [], new SineReadingTracker(), DEFAULT_SHAPING);
    expect(earlier.map((n) => n.pitchMidi)).toEqual([60]);
    const merged = await previewStep(take, earlier, new SineReadingTracker(), DEFAULT_SHAPING);
    expect(merged.map((n) => n.pitchMidi)).toEqual([60, 64]);
    expect(merged[0].startTimeSeconds).toBeCloseTo(1.2, 1);
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
      stop: async () => {},
    };
    let started = 0;
    const rec = new VoiceRecorder(capture, { countInBeats: 2, beatSeconds: 0.5, onTakeStart: () => { started++; } });
    await rec.start();
    expect(clicks).toEqual([0, 0.5]);
    deliver(new Float32Array(900).fill(0.1)); // count-in (1000 samples long)
    expect(started).toBe(0);
    deliver(new Float32Array(300).fill(0.5)); // 100 more count-in + 200 take
    const take = await rec.stop();
    expect(started).toBe(1);
    expect(take.length).toBe(200);
    expect(take[0]).toBe(0.5);
  });

  it('keeps the blocks the capture delivers while it flushes on stop (TE-1)', async () => {
    let deliver: (b: Float32Array) => void = () => {};
    const capture: VoiceCapture = {
      sampleRate: 1000,
      start: async (cb) => { deliver = cb; },
      click: () => {},
      // The last block is still on its way from the worklet when stop is called.
      stop: async () => { deliver(new Float32Array(50).fill(0.75)); },
    };
    const rec = new VoiceRecorder(capture, { countInBeats: 0, beatSeconds: 0.5 });
    await rec.start();
    deliver(new Float32Array(100).fill(0.2));
    const take = await rec.stop();
    expect(take.length).toBe(150);
    expect(take[149]).toBe(0.75);
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
        { row: 0, offsetRows: 0, heardSeconds: 0, lengthRows: 2, midi: 60, velocity: 1 },
        { row: len, offsetRows: 0, heardSeconds: 0, lengthRows: 1, midi: 62, velocity: 1 },
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

  it('clears the whole channel from the start row, so a shorter take leaves no old notes behind', () => {
    const pattern = structuredClone(useTrackerStore.getState().patterns[0]);
    const rows = pattern.channels[0].rows;
    const last = rows.length - 1;
    rows[1].note = 30; // before the start row: kept
    rows[10].note = 40;
    rows[last].note = 50;
    rows[last].instrument = 2;
    rows[last].effTyp = 0xa;
    rows[last].eff = 0x0f;
    applyNotesToPattern(
      pattern,
      [{ row: 0, offsetRows: 0, heardSeconds: 0, lengthRows: 2, midi: 60, velocity: 1 }],
      { channelIndex: 0, startRow: 4, instrumentId: 3 },
    );
    expect(rows[1].note).toBe(30);
    expect(rows[4].note).toBeGreaterThan(0);
    expect(rows[6].note).toBe(NOTE_OFF);
    expect(rows[10].note).toBe(0);
    expect(rows[last]).toMatchObject({ note: 0, instrument: 0, effTyp: 0, eff: 0 });
  });
});


describe('multi-pattern take (VNR-27)', () => {
  beforeEach(() => resetStore(useTrackerStore));

  const sized = (length: number): Pattern => {
    const p = structuredClone(useTrackerStore.getState().patterns[0]);
    p.length = length;
    for (const ch of p.channels) ch.rows = Array.from({ length }, () => ({ ...ch.rows[0], note: 0 }));
    return p;
  };
  const note = (row: number, midi = 60) => ({ row, offsetRows: 0, heardSeconds: 0, lengthRows: 1, midi, velocity: 1 });

  it('needs rows through the last note only', () => {
    expect(takeRowsNeeded([note(3), note(20)])).toBe(21);
    expect(takeRowsNeeded([])).toBe(0);
  });

  it('walks the song order, copies a repeated pattern and adds empty patterns past the order end', () => {
    const song: TakeSong = { patterns: [sized(16), sized(8)], patternOrder: [0, 1, 0] };
    const segs = planTakeSegments(song, 0, 0, 4, 60, null);
    expect(segs).toEqual([
      { position: 0, patternIndex: 0, create: null, fromRow: 4, rows: 12 },
      { position: 1, patternIndex: 1, create: null, fromRow: 0, rows: 8 },
      { position: 2, patternIndex: 2, create: { from: 0, kind: 'copy' }, fromRow: 0, rows: 16 },
      { position: 3, patternIndex: 3, create: { from: 0, kind: 'empty' }, fromRow: 0, rows: 16 },
      { position: 4, patternIndex: 4, create: { from: 0, kind: 'empty' }, fromRow: 0, rows: 16 },
    ]);
  });

  it('stops at the format pattern limit, and writes one pattern when it is not in the order', () => {
    const song: TakeSong = { patterns: [sized(16)], patternOrder: [0] };
    expect(planTakeSegments(song, 0, 0, 0, 40, { maxPatterns: 2, maxPositions: 128 })).toHaveLength(2);
    expect(planTakeSegments(song, 0, 0, 0, 40, { maxPatterns: 64, maxPositions: 1 })).toHaveLength(1);
    expect(planTakeSegments(song, 0, -1, 0, 40, null)).toHaveLength(1);
  });

  it('writes across patterns, clears every reached pattern to its end and drops notes past the limit', () => {
    const song: TakeSong = { patterns: [sized(16), sized(16)], patternOrder: [0, 1] };
    song.patterns[1].channels[0].rows[12].note = 40; // old note in the last reached pattern: cleared
    song.patterns[1].channels[1].rows[12].note = 41; // other channel: kept
    const segs = planTakeSegments(song, 0, 0, 8, 40, { maxPatterns: 3, maxPositions: 128 });
    const built = new Map([[2, sized(16)]]);
    const res = applyTakeToSong(song, [note(0), note(10, 62), note(30, 64), note(60, 65)], { channelIndex: 0, startRow: 8, instrumentId: 1 }, segs, built);
    expect(res).toEqual({ written: 3, dropped: 1, patterns: 3 });
    expect(song.patternOrder).toEqual([0, 1, 2]);
    expect(song.patterns).toHaveLength(3);
    expect(song.patterns[0].channels[0].rows[8].note).toBeGreaterThan(0);
    expect(song.patterns[1].channels[0].rows[2].note).toBeGreaterThan(0); // row 10 of the take
    expect(song.patterns[1].channels[0].rows[12].note).toBe(0);
    expect(song.patterns[1].channels[1].rows[12].note).toBe(41);
    expect(song.patterns[2].channels[0].rows[6].note).toBeGreaterThan(0); // row 30 of the take
  });
});

import { snapMidiToKey, snapNotesToKey } from '../scaleSnap';
import { detectClickOnset, getStoredLatencyMs, storeLatencyMs, measureLoopbackLatencyMs, LATENCY_STORAGE_KEY } from '../latencyCalibration';

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
      stop: async () => {},
    };
    expect(await measureLoopbackLatencyMs(cap)).toBeNull();
  });
});

