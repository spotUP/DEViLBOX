/**
 * HUM-TO-PATTERN measurement: a synthetic sung-like take (harmonic tone,
 * 5.5 Hz +-40 cent vibrato, 30 ms attack, breath noise) through the live loop
 * exactly as useVoiceRecorder runs it - worklet batches of 2048 samples, a
 * preview step every LIVE_HOP_SECONDS on the take so far, real SwiftF0 (the
 * app's model and inference core, ONNX Runtime Web on node) - into the live
 * cell writes. Measures onset -> correct cell written, and pitch accuracy.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as ort from 'onnxruntime-web/wasm';
import { detectF0 } from '../swiftF0Core';
import { clampRange, hzToMidi, TRACK_HOP_SECONDS, type F0Track, type PitchTracker } from '../pitchTrack';
import { PITCH_SAMPLE_RATE } from '../pitchNotes';
import { LIVE_HOP_SECONDS, previewStep } from '../liveWindow';
import { DEFAULT_SHAPING, shapeNotes } from '../voiceToNotes';
import { ALL_EFFECTS, melodyRows } from '../noteEffects';
import { liveCellWrites } from '../liveWrite';
import type { QuantisedNote } from '../quantise';
import { midiToXMNote } from '@/lib/xmConversions';
import type { QuantiseSettings } from '../quantise';

const ROOT = join(__dirname, '../../../..');
const SR = PITCH_SAMPLE_RATE;
const BATCH = 2048; // public/worklets/voice-recorder.worklet.js BATCH_SAMPLES

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = join(ROOT, 'node_modules/onnxruntime-web/dist/');

let session: Promise<ort.InferenceSession> | null = null;
const inferMs: number[] = [];
const swiftF0Node: PitchTracker = {
  async track(samples, range) {
    session ??= ort.InferenceSession.create(readFileSync(join(ROOT, 'public/models/swift-f0/model.onnx')), { executionProviders: ['wasm'] });
    const { fminHz, fmaxHz } = clampRange(range);
    const t0 = performance.now();
    const r = await detectF0(ort, await session, { audio: samples, sampleRate: SR, fmin: fminHz, fmax: fmaxHz });
    inferMs.push(performance.now() - t0);
    return { ...r, hopSeconds: TRACK_HOP_SECONDS } satisfies F0Track;
  },
};

interface SungNote { midi: number; start: number; dur: number }
// Gaps (breaths) and legato steps (dur reaches the next start)
const MELODY: SungNote[] = [
  [60, 0.5, 0.45], [62, 1.0, 0.45], [64, 1.5, 0.5], [67, 2.0, 0.7], [64, 2.75, 0.4],
  [60, 3.2, 0.45], [57, 3.7, 0.5], [59, 4.25, 0.6], [60, 4.85, 0.8], [65, 5.8, 0.4],
  [64, 6.2, 0.4], [62, 6.6, 0.4], [60, 7.0, 0.9],
].map(([midi, start, dur]) => ({ midi, start, dur }));

/** Instantaneous f0 of the sung take at time t, 0 between notes. */
function truthHz(t: number): number {
  const n = MELODY.find((m) => t >= m.start && t < m.start + m.dur);
  return n ? 440 * 2 ** ((n.midi - 69 + 0.4 * Math.sin(2 * Math.PI * 5.5 * (t - n.start))) / 12) : 0;
}

function sungTake(seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  let phase = 0;
  let seed = 1;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const n = MELODY.find((m) => t >= m.start && t < m.start + m.dur);
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const noise = (seed / 0x7fffffff - 0.5) * 0.004;
    if (!n) { out[i] = noise; continue; }
    phase += (2 * Math.PI * truthHz(t)) / SR;
    const env = Math.min(1, (t - n.start) / 0.03, (n.start + n.dur - t) / 0.03);
    out[i] = env * 0.3 * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase) + 0.12 * Math.sin(4 * phase)) + noise;
  }
  return out;
}

const Q: QuantiseSettings = { bpm: 125, speed: 6, swing: 0, minLengthRows: 1, latencyNudgeMs: 0, strength: 1, toleranceRows: 0.1 };
const TARGET = { channelIndex: 0, startRow: 0, instrumentId: 1 };
const ROWS = 256;

// The SwiftF0 model is gitignored (public/models/), so clean checkouts skip the real-model test.
const HAS_MODEL = existsSync(join(ROOT, 'public/models/swift-f0/model.onnx'));

describe.skipIf(!HAS_MODEL)('Hum to Pattern live path (synthetic sung take, real SwiftF0)', () => {
  it('writes every sung note at its row, measured onset -> cell latency and pitch accuracy', async () => {
    const audio = sungTake(8.5);
    // Each note's row is the row the stop commit gives it (full-take SwiftF0 +
    // the same quantiser), not round((start - first) / row): the quantiser snaps
    // take times and then shifts by whole rows (VNR-24), and 1.5 s, 4.85 s and
    // 7.0 s sit within one 16 ms tracker hop of a half row, so a 10-20 ms late
    // detected onset lands on the next row in the commit too. Whether the
    // commit heard each note on time and pitch is finalRight below.
    const full = await swiftF0Node.track(audio);
    const finalNotes = shapeNotes(full, DEFAULT_SHAPING);
    const commitRows = melodyRows(finalNotes, Q, null, null, ALL_EFFECTS);
    const heardAs = (n: SungNote) => finalNotes.findIndex((v) => Math.abs(v.startTimeSeconds - n.start) < 0.08 && v.pitchMidi === n.midi);
    const expectedRow = (n: SungNote) => commitRows.find((r) => r.heardSeconds === finalNotes[heardAs(n)]?.startTimeSeconds)?.row ?? -1;

    let live = [] as Awaited<ReturnType<typeof previewStep>>;
    const written = new Map<number, number>();
    const firstRight = new Map<number, number>(); // note index -> wall seconds the right cell was first written
    for (let h = 1; h * LIVE_HOP_SECONDS <= audio.length / SR; h++) {
      const wall = h * LIVE_HOP_SECONDS;
      // The take the main thread holds at `wall`: whole worklet batches only
      const take = audio.subarray(0, Math.floor((wall * SR) / BATCH) * BATCH);
      const before = inferMs.length;
      live = await previewStep(take, live, swiftF0Node, DEFAULT_SHAPING);
      const stepMs = inferMs.slice(before).reduce((a, b) => a + b, 0);
      for (const w of liveCellWrites(melodyRows(live, Q, null, null, ALL_EFFECTS), TARGET, ROWS, written)) {
        if (w.note) written.set(w.row, w.note); else written.delete(w.row);
      }
      MELODY.forEach((n, k) => {
        if (!firstRight.has(k) && written.get(expectedRow(n)) === midiToXMNote(n.midi)) firstRight.set(k, wall + stepMs / 1000);
      });
    }

    const latencies = MELODY.map((n, k) => (firstRight.has(k) ? firstRight.get(k)! - n.start : NaN));
    const found = latencies.filter((l) => !Number.isNaN(l)).sort((a, b) => a - b);
    const median = found[Math.floor(found.length / 2)];
    const max = found[found.length - 1];

    // Pitch accuracy: frames of the full-take track within 50 cents of the sung f0, and notes on the right semitone
    let voiced = 0;
    let within = 0;
    const centsErr: number[] = [];
    for (let f = 0; f < full.hz.length; f++) {
      const truth = truthHz(f * full.hopSeconds);
      if (!truth || full.confidence[f] < 0.5) continue;
      voiced++;
      const c = Math.abs(1200 * Math.log2(full.hz[f] / truth));
      centsErr.push(c);
      if (c < 50) within++;
    }
    centsErr.sort((a, b) => a - b);
    const finalRight = MELODY.filter((n) => heardAs(n) >= 0).length;
    const liveRight = MELODY.filter((n) => written.get(expectedRow(n)) === midiToXMNote(n.midi)).length;
    const steps = inferMs.slice(1).sort((a, b) => a - b);

    console.log(
      `[HUM] notes ${MELODY.length}; live right at end ${liveRight}; full-take right ${finalRight}; extra live cells ${[...written.values()].filter((v) => v !== 97).length - liveRight}\n` +
      `[HUM] onset->cell latency s: median ${median.toFixed(3)} max ${max.toFixed(3)} all ${latencies.map((l) => l.toFixed(2)).join(' ')}\n` +
      `[HUM] SwiftF0 step ms: median ${steps[Math.floor(steps.length / 2)].toFixed(1)} max ${steps[steps.length - 1].toFixed(1)} (1.5 s window)\n` +
      `[HUM] frames voiced ${voiced}, within 50 cents ${(100 * within / voiced).toFixed(1)} %, median err ${centsErr[Math.floor(centsErr.length / 2)].toFixed(1)} cents; midi of first note ${hzToMidi(full.hz[Math.round(0.7 / full.hopSeconds)]).toFixed(2)}`,
    );

    expect(found.length).toBe(MELODY.length);
    expect(liveRight).toBe(MELODY.length);
    expect(finalRight).toBe(MELODY.length);
    expect(within / voiced).toBeGreaterThan(0.95);
    // Budget (plan doc): a hummed note is in its cell within 0.8 s of the onset
    expect(max).toBeLessThan(0.8);
  }, 120_000);
});

describe('liveCellWrites', () => {
  const note = (row: number, midi: number, lengthRows = 2): QuantisedNote => ({ row, offsetRows: 0, heardSeconds: 0, lengthRows, midi, velocity: 1 });
  const apply = (writes: ReturnType<typeof liveCellWrites>, written: Map<number, number>) =>
    writes.forEach((w) => (w.note ? written.set(w.row, w.note) : written.delete(w.row)));

  it('writes only changed rows, overwrites a revised note and clears a dropped one', () => {
    const written = new Map<number, number>();
    const t = { channelIndex: 0, startRow: 4, instrumentId: 1 };
    apply(liveCellWrites([note(0, 60), note(4, 62)], t, 16, written), written);
    expect([...written.entries()]).toEqual([[4, midiToXMNote(60)], [6, 97], [8, midiToXMNote(62)], [10, 97]]);
    // Same take again: nothing to write
    expect(liveCellWrites([note(0, 60), note(4, 62)], t, 16, written)).toEqual([]);
    // Second note revised to 64 and moved; the old row is cleared
    const revised = liveCellWrites([note(0, 60), note(5, 64)], t, 16, written);
    apply(revised, written);
    expect(revised.map((w) => w.row).sort((a, b) => a - b)).toEqual([8, 9, 10, 11]);
    expect(written.get(9)).toBe(midiToXMNote(64));
    expect(written.has(8)).toBe(false);
    // Rows the take never wrote are untouched
    expect(revised.every((w) => w.row >= 4)).toBe(true);
  });
});
