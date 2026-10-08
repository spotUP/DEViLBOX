/**
 * The punchy Amiga club presets must be audibly punchy.
 *
 * Owner, 2026-10-08: "the presets that sound like they should be punchy,
 * tracker dancefloor, paula punchline etc don't change the audio much" and
 * "is our bass swallowed?". Measured on a song at matched level, Paula
 * Punchline lifted 63 Hz by 0.6 dB over the mids and cut the crest factor by
 * 1.4 dB: a 2 dB bell at 120 Hz in front of a compressor with a 5 ms attack,
 * which clamps every kick on its way in. The master path itself loses nothing
 * (checked with an empty chain, every stage within 0.1 dB).
 *
 * Rendered offline with the real EffectFactory nodes (real Tone on
 * node-web-audio-api) on a synthetic drum-and-bass loop: kick, bass, snare,
 * hats, pad. Only the Tone effects of a preset run here; WASM effects (the
 * exciter, bass enhancer) need a worklet and are left out, so these numbers
 * are what the preset's EQ, tape and compressor alone deliver.
 *   bassVsRest = gain of the low band (<150 Hz) minus gain of the rest (above
 *                500 Hz), dB
 *   crestDelta = crest factor (peak over RMS) with the chain minus without it, dB
 */
import { describe, it, expect } from 'vitest';
import type * as Tone from 'tone';
import { FX_PRESETS } from '../fxPresets';
import { installRealWebAudio } from '@/test/audio/realWebAudio';

const SR = 48000;
const SECONDS = 6;

/** A deterministic 2-beat-per-second loop: kick, bass, snare, hats, pad. */
function loop(): Float32Array {
  const n = SR * SECONDS;
  const x = new Float32Array(n);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
  const beat = SR / 2;
  for (let b = 0; b * beat < n; b++) {
    const t0 = b * beat;
    for (let i = 0; i < beat && t0 + i < n; i++) {
      const t = i / SR;
      let v = 0;
      if (b % 2 === 0) { // kick: 130 -> 50 Hz sweep, 150 ms
        const f = 50 + 80 * Math.exp(-t * 40);
        v += 0.7 * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 18);
      } else if (t < 0.15) { // snare: noise burst
        v += 0.35 * rnd() * Math.exp(-t * 25);
      }
      v += 0.2 * Math.sin(2 * Math.PI * 55 * t) * (t > 0.12 ? 1 : 0);       // bass
      if (t < 0.03) v += 0.1 * rnd() * Math.exp(-t * 120);                    // hat
      v += 0.06 * Math.sin(2 * Math.PI * 440 * t) + 0.05 * Math.sin(2 * Math.PI * 1320 * t); // pad
      x[t0 + i] += v;
    }
  }
  return x;
}

/** A steady sine at `hz`. */
function loopOverride(hz: number): Float32Array {
  const x = new Float32Array(SR * SECONDS);
  for (let i = 0; i < x.length; i++) x[i] = 0.1 * Math.sin(2 * Math.PI * hz * i / SR);
  return x;
}

/** Second-order low-pass (RBJ), cascaded twice for 24 dB per octave. */
function lowpass(x: Float32Array, hz: number): Float32Array {
  let y = x;
  for (let pass = 0; pass < 2; pass++) {
    const w = 2 * Math.PI * hz / SR, c = Math.cos(w), a = Math.sin(w) / (2 * Math.SQRT1_2);
    const b0 = (1 - c) / 2, b1 = 1 - c, b2 = (1 - c) / 2, a0 = 1 + a, a1 = -2 * c, a2 = 1 - a;
    const o = new Float32Array(y.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < y.length; i++) {
      const v = (b0 * y[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = y[i]; y2 = y1; y1 = v; o[i] = v;
    }
    y = o;
  }
  return y;
}

const rmsDb = (x: Float32Array, from = SR): number => {
  let s = 0; for (let i = from; i < x.length; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / (x.length - from) + 1e-20);
};
const peakDb = (x: Float32Array, from = SR): number => {
  let p = 0; for (let i = from; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  return 20 * Math.log10(p + 1e-20);
};
const crestDb = (x: Float32Array) => peakDb(x) - rmsDb(x);

type Fx = { category: string; type: string; wet: number; enabled?: boolean; parameters: Record<string, number> };
async function render(fxs: readonly Fx[] | null, input: Float32Array = loop()): Promise<Float32Array> {
  installRealWebAudio();
  const Tone = await import('tone');
  const { createEffect } = await import('@/engine/factories/EffectFactory');
  const ctx = new OfflineAudioContext(1, SR * SECONDS, SR);
  Tone.setContext(ctx);
  const src = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, SR * SECONDS, SR);
  buf.copyToChannel(new Float32Array(input), 0);
  src.buffer = buf;
  let last: AudioNode = src;
  if (fxs) {
    for (const fx of fxs.filter((e) => e.category === 'tonejs' && e.enabled !== false)) {
      const node = await createEffect({ id: fx.type, enabled: true, ...fx } as never) as unknown as { input: AudioNode; output: AudioNode } & Tone.ToneAudioNode;
      Tone.connect(last as never, node as never);
      last = node as unknown as AudioNode;
    }
  }
  Tone.connect(last as never, ctx.destination as never);
  src.start();
  return (await ctx.startRendering()).getChannelData(0).slice();
}

async function measure(fxs: readonly Fx[]) {
  const dry = await render(null);
  const wet = await render(fxs);
  const split = (x: Float32Array) => { const upTo500 = lowpass(x, 500); return { low: lowpass(x, 150), rest: x.map((v, i) => v - upTo500[i]) as Float32Array }; };
  const d = split(dry), w = split(wet);
  const lowGain = rmsDb(w.low) - rmsDb(d.low);
  const restGain = rmsDb(w.rest) - rmsDb(d.rest);
  const totalGain = rmsDb(wet) - rmsDb(dry);
  return { bassVsRest: lowGain - restGain, crestDelta: crestDb(wet) - crestDb(dry), totalGain };
}

/** Gain in dB the EQ3 gives a steady sine at `hz`. */
async function eq3SineGainDb(parameters: Record<string, number>, hz: number): Promise<number> {
  const dry = loopOverride(hz);
  const wet = await render([{ category: 'tonejs', type: 'EQ3', wet: 100, parameters }], dry);
  return rmsDb(wet) - rmsDb(dry);
}

describe('EQ3 gain is the dB it is set to', () => {
  it('a +9 dB low band at 90 Hz boosts a 90 Hz sine by 9 dB, not 2.8 dB', async () => {
    const g = await eq3SineGainDb({ low: 9, mid: 0, high: 0, lowFrequency: 90, highFrequency: 6000 }, 90);
    expect(g).toBeGreaterThan(8.5);
    expect(g).toBeLessThan(9.5);
  }, 60000);
  it('a -6 dB low band cuts a 90 Hz sine instead of boosting it', async () => {
    const g = await eq3SineGainDb({ low: -6, mid: 0, high: 0, lowFrequency: 90, highFrequency: 6000 }, 90);
    expect(g).toBeLessThan(-5.5);
    expect(g).toBeGreaterThan(-6.5);
  }, 60000);
});

describe('punchy Amiga club presets (Tone effects only)', () => {
  const cases: Array<[string, { bass: number; crest: number }]> = [
    ['Paula Punchline', { bass: 3, crest: -0.5 }],
    ['Tracker Dance Floor', { bass: 2.5, crest: -0.5 }],
    ['Amiga Bass Cannon', { bass: 4, crest: -1.8 }],
  ];
  for (const [name, want] of cases) {
    it(`${name} lifts the bass by at least ${want.bass} dB over the rest and keeps the crest within ${-want.crest} dB`, async () => {
      const preset = FX_PRESETS.find((p) => p.name === name)!;
      const m = await measure(preset.effects as Fx[]);
      expect(m.bassVsRest).toBeGreaterThanOrEqual(want.bass);
      expect(m.crestDelta).toBeGreaterThanOrEqual(want.crest);
    }, 120000);
  }
});
