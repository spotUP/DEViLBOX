/**
 * Key Lock keeps drum transients sharp (owner report 2026-10-12: Key Lock
 * "sounds like 90's jungle timestretch").
 *
 * The old insert was SoundTouch (time-domain WSOLA): its splices double and
 * drop drum hits and make sustained notes warble. Measured on this song at
 * playbackRate 0.92: onset-curve correlation with the source 0.40, sustain
 * band jitter 2.36 dB. Signalsmith Stretch in the shipped configuration:
 * 0.78 and 1.21 dB.
 *
 * Drives the exact worklet files the browser loads (idle shim + vendored
 * Signalsmith build) with DeckKeyLock's own configuration, on a real module
 * rendered by UADE, through the deck's chain: playbackRate resample, then the
 * pitch compensation from computeKeyLockShift. Offline - no AudioContext.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { renderPathToSamples, PROJECT_ROOT } from '../../../../tools/uade-audit/uadeRenderCore';
import { loadWorklet, settle, streamThrough, RENDER_QUANTUM, type HostedProcessor } from '../../../../tools/keylock/workletHost';
import { SR, spec, measure, resampleLinear, clickTrain, latencySamples, HOP_SAMPLES } from '../../../../tools/keylock/stretchMetrics';
import { computeKeyLockShift } from '../computeKeyLockShift';
import { STRETCH_CONFIG, TONALITY_HZ } from '../DeckKeyLock';

const WORKLET_FILES = ['idleWhenBypassed.js', 'SignalsmithStretch.mjs'].map((f) => join(PROJECT_ROOT, 'public/signalsmith-stretch', f));
const SONG = join(PROJECT_ROOT, 'public/data/songs/mod/break the box.mod');
const SECONDS = 10;

interface KeyLocked { left: Float32Array; right: Float32Array; reportedLatencySec: number; proc: HostedProcessor }

/** The deck's Key Lock insert, configured as DeckKeyLock configures it, fed `semis` of compensation. */
async function keyLockInsert(left: Float32Array, right: Float32Array, semis: number): Promise<KeyLocked> {
  const host = loadWorklet(WORKLET_FILES, SR);
  const proc = host.create('signalsmith-stretch', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
  for (let i = 0; i < 200 && !proc.port.received.some((m) => Array.isArray(m) && m[0] === 'ready'); i++) await settle(10);
  proc.port.send([1, 'configure', { ...STRETCH_CONFIG }]);
  proc.port.send([2, 'schedule', { active: true, semitones: semis, tonalityHz: TONALITY_HZ }]);
  proc.port.send([3, 'latency']);
  const latency = proc.port.received.find((m) => Array.isArray(m) && m[0] === 3) as [number, number];
  const out = streamThrough(host, proc, left, right);
  return { left: out.left, right: out.right, reportedLatencySec: latency[1], proc };
}

const mono = (l: Float32Array, r: Float32Array) => Float32Array.from(l, (v, i) => 0.5 * (v + r[i]));

describe('Key Lock keeps transients sharp', () => {
  let left: Float32Array; let right: Float32Array;
  beforeAll(async () => {
    const r = await renderPathToSamples(SONG, { sampleRate: SR, seconds: SECONDS });
    left = new Float32Array(r.frames); right = new Float32Array(r.frames);
    for (let i = 0; i < r.frames; i++) { left[i] = r.samples[2 * i]; right[i] = r.samples[2 * i + 1]; }
  }, 60_000);

  for (const rate of [0.92, 1.08]) {
    it(`drum hits land where the song has them, without warble, at playbackRate ${rate}`, async () => {
      const { pitchCompensate } = computeKeyLockShift(12 * Math.log2(rate), true);
      const out = await keyLockInsert(resampleLinear(left, rate), resampleLinear(right, rate), pitchCompensate);
      const m = measure(spec(mono(left, right)), spec(mono(out.left, out.right)), rate, out.reportedLatencySec * SR / HOP_SAMPLES);
      // SoundTouch: 0.40 / 0.49 and 2.36 / 2.26 dB. Signalsmith: 0.78 / 0.81 and 1.21 / 1.31 dB.
      expect(m.fluxCorr, 'onset curve vs the source: hits doubled, dropped or smeared').toBeGreaterThan(0.65);
      expect(m.warbleDb, 'band-energy jitter on sustained notes').toBeLessThan(1.7);
    }, 60_000);
  }

  it('latencySec is the delay the listener hears, at every fader position', async () => {
    const clicks = clickTrain(3);
    for (const rate of [0.5, 0.92, 1.08]) {
      const { pitchCompensate } = computeKeyLockShift(12 * Math.log2(rate), true);
      const out = await keyLockInsert(clicks, clicks, pitchCompensate);
      const heardSec = latencySamples(mono(out.left, out.right).subarray(SR), clicks.subarray(SR)) / SR;
      // SoundTouch reported 110 ms at rate 0.5 and delayed by 69 ms.
      expect(Math.abs(heardSec - out.reportedLatencySec), `rate ${rate}`).toBeLessThan(0.003);
    }
  }, 60_000);

  it('no dropout after engaging: continuous input gives continuous output once the latency has passed', async () => {
    const tone = Float32Array.from({ length: 3 * SR }, (_, i) => 0.3 * Math.sin(2 * Math.PI * 220 * i / SR));
    const out = await keyLockInsert(tone, tone, computeKeyLockShift(12 * Math.log2(0.6), true).pitchCompensate);
    const first = Math.ceil((out.reportedLatencySec + 0.01) * SR / RENDER_QUANTUM);
    const silent: number[] = [];
    for (let b = first; b < out.left.length / RENDER_QUANTUM; b++) {
      let e = 0; for (let i = 0; i < RENDER_QUANTUM; i++) e += out.left[b * RENDER_QUANTUM + i] ** 2;
      if (Math.sqrt(e / RENDER_QUANTUM) < 0.01) silent.push(b);
    }
    expect(silent, 'silent render quanta after the latency (SoundTouch: 10 at rate 0.85)').toEqual([]);
  }, 60_000);

  it('a bypassed Key Lock idles: silence out, no stretch work', async () => {
    const tone = Float32Array.from({ length: SR / 2 }, (_, i) => 0.3 * Math.sin(2 * Math.PI * 220 * i / SR));
    const host = loadWorklet(WORKLET_FILES, SR);
    const proc = host.create('signalsmith-stretch', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }) as HostedProcessor & { wasmModule: { _process: (...a: number[]) => void } };
    for (let i = 0; i < 200 && !proc.wasmModule; i++) await settle(10);
    proc.port.send([1, 'configure', { ...STRETCH_CONFIG }]);
    proc.port.send([2, 'schedule', { active: false }]); // what DeckKeyLock sends on bypass
    let calls = 0; const real = proc.wasmModule._process; proc.wasmModule._process = (...a: number[]) => { calls++; real(...a); };
    const out = streamThrough(host, proc, tone, tone);
    expect(calls).toBe(0);
    expect(out.left.every((v) => v === 0)).toBe(true);
  }, 60_000);
});
