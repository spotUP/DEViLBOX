/**
 * A master FX preset rendered offline with the real effect nodes, and the
 * numbers its description promises read off the result.
 *
 * Tone.js effects run on node-web-audio-api; WASM effects run their real
 * worklets (resolveWorkletsFromPublic + servePublicToFetch), loaded before the
 * render starts so the graph does not change under it. The make-up gain of the
 * preset is applied after the chain, as MasterEffectsChain does.
 *
 * Metrics (all against the same input without the chain, so a make-up gain or
 * a level offset never decides a claim unless the claim is about level):
 *   bandGainDb(f)   gain of a third-octave noise band at f (-30 dBFS, linear region)
 *   sineGainDb(f,l) gain of a steady sine, level l dBFS
 *   thdDb(f,l)      harmonics 2..6 of a sine, dB below the fundamental
 *   staticGrDb      compression: -40 -> -10 dBFS step on 1 kHz; 30 minus the output rise
 *   crestDeltaDb    crest factor change on the drum loop
 *   bassVsRestDb    gain of <150 Hz minus gain of >500 Hz on the drum loop
 *   tail            decay of a noise burst: ms until the last frame within 40 dB of the burst, and the level after 200 ms
 */
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch, audioLoadsSettled, realDelay } from './realWebAudio';

export const SR = 48000;
export type Fx = { category: string; type: string; wet: number; enabled?: boolean; parameters: Record<string, number | string> };
export type Stereo = [Float32Array, Float32Array];

let ready = false;
async function setup() {
  if (!ready) {
    installRealWebAudio();
    resolveWorkletsFromPublic();
    servePublicToFetch();
    ready = true;
  }
}

let seedState = 12345;
const rnd = () => { seedState = (seedState * 1664525 + 1013904223) >>> 0; return seedState / 4294967296 * 2 - 1; };

export function drumLoop(seconds = 6): Float32Array {
  seedState = 12345;
  const n = SR * seconds, x = new Float32Array(n), beat = SR / 2;
  for (let b = 0; b * beat < n; b++) {
    const t0 = b * beat;
    for (let i = 0; i < beat && t0 + i < n; i++) {
      const t = i / SR;
      let v = 0;
      if (b % 2 === 0) { const f = 50 + 80 * Math.exp(-t * 40); v += 0.7 * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 18); }
      else if (t < 0.15) v += 0.35 * rnd() * Math.exp(-t * 25);
      v += 0.2 * Math.sin(2 * Math.PI * 55 * t) * (t > 0.12 ? 1 : 0);
      if (t < 0.03) v += 0.1 * rnd() * Math.exp(-t * 120);
      v += 0.06 * Math.sin(2 * Math.PI * 440 * t) + 0.05 * Math.sin(2 * Math.PI * 1320 * t);
      x[t0 + i] += v;
    }
  }
  return x;
}

export function sine(hz: number, levelDb: number, seconds = 3): Float32Array {
  const a = 10 ** (levelDb / 20), x = new Float32Array(SR * seconds);
  for (let i = 0; i < x.length; i++) x[i] = a * Math.sin(2 * Math.PI * hz * i / SR);
  return x;
}

function biquadBandpass(x: Float32Array, hz: number, q: number): Float32Array {
  const w = 2 * Math.PI * hz / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q);
  const b0 = al, b2 = -al, a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  const o = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; o[i] = v;
  }
  return o;
}
/** Third-octave noise band at `hz`, scaled to `levelDb` RMS. */
export function noiseBand(hz: number, levelDb: number, seconds = 3): Float32Array {
  seedState = 777;
  const w = new Float32Array(SR * seconds); for (let i = 0; i < w.length; i++) w[i] = rnd();
  let y = biquadBandpass(w, hz, 4.3);
  y = biquadBandpass(y, hz, 4.3);
  const r = rmsOf(y, SR / 2);
  const k = 10 ** (levelDb / 20) / r;
  return y.map((v) => v * k) as Float32Array;
}

export function lowpass(x: Float32Array, hz: number): Float32Array {
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

export const rmsOf = (x: Float32Array, from = SR / 2, to = x.length): number => {
  let s = 0; for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
};
export const rmsDb = (x: Float32Array, from = SR / 2, to = x.length): number => 20 * Math.log10(rmsOf(x, from, to) + 1e-12);
export const peakDb = (x: Float32Array, from = SR / 2): number => { let p = 0; for (let i = from; i < x.length; i++) p = Math.max(p, Math.abs(x[i])); return 20 * Math.log10(p + 1e-12); };
export const crestDb = (x: Float32Array): number => peakDb(x) - rmsDb(x);

/** Energy of a sine at `hz` in the window, by correlation, dB re 1. */
function toneDb(x: Float32Array, hz: number, from: number, to: number): number {
  let re = 0, im = 0;
  for (let i = from; i < to; i++) { const ph = 2 * Math.PI * hz * i / SR; re += x[i] * Math.cos(ph); im += x[i] * Math.sin(ph); }
  const n = to - from;
  return 20 * Math.log10(2 * Math.hypot(re, im) / n + 1e-12);
}

/** Render a mono input (both channels) through the chain; the preset make-up is applied at the end. */
export async function renderChain(fxs: readonly Fx[] | null, input: Float32Array, makeUpDb = 0, retry = 0): Promise<Stereo> {
  await setup();
  const Tone = await import('tone');
  await import('@/engine/registry/effects'); // the app registers its effects at startup
  const { createEffect } = await import('@/engine/factories/EffectFactory');
  const seconds = input.length / SR;
  const ctx = new OfflineAudioContext(2, input.length, SR);
  Tone.setContext(ctx as never);
  const src = ctx.createBufferSource();
  const buf = ctx.createBuffer(2, input.length, SR);
  buf.copyToChannel(new Float32Array(input), 0); buf.copyToChannel(new Float32Array(input), 1);
  src.buffer = buf;
  let last: unknown = src;
  if (fxs) {
    for (const [i, fx] of fxs.filter((e) => e.enabled !== false).entries()) {
      const node = await createEffect({ id: `rig-${i}`, enabled: true, ...fx } as never);
      Tone.connect(last as never, node as never);
      last = node;
    }
  }
  if (makeUpDb) {
    const g = ctx.createGain(); g.gain.value = 10 ** (makeUpDb / 20);
    Tone.connect(last as never, g as never); last = g;
  }
  Tone.connect(last as never, ctx.destination as never);
  await audioLoadsSettled(400, 20000);
  // The worklet answers its init with a 'ready' message, then the effect splices itself in.
  if (fxs?.some((e) => e.category !== 'tonejs')) await realDelay(1500 * (1 + retry));
  src.start();
  const out = await ctx.startRendering();
  void seconds;
  const res: Stereo = [out.getChannelData(0).slice(), out.getChannelData(1).slice()];
  // A worklet that was not spliced in yet (the machine was busy) renders digital silence: try again, slower.
  if (fxs && rmsDb(input, 0) > -90 && rmsDb(res[0], 0) < -150 && retry < 3) return renderChain(fxs, input, makeUpDb, retry + 1);
  return res;
}

export class PresetRig {
  readonly fxs: readonly Fx[];
  readonly makeUpDb: number;
  constructor(fxs: readonly Fx[], makeUpDb = 0) { this.fxs = fxs; this.makeUpDb = makeUpDb; }
  private cache = new Map<string, Promise<Stereo>>();
  /** The input without a chain is the same for every preset. */
  private static dry = new Map<string, Promise<Stereo>>();
  private run(key: string, input: () => Float32Array, wet: boolean): Promise<Stereo> {
    const cache = wet ? this.cache : PresetRig.dry;
    if (!cache.has(key)) cache.set(key, renderChain(wet ? this.fxs : null, input(), wet ? this.makeUpDb : 0));
    return cache.get(key)!;
  }
  /** Gain, dB, of a third-octave noise band at f. */
  async bandGainDb(hz: number, levelDb = -30): Promise<number> {
    const [d, w] = await Promise.all([this.run(`band${hz}@${levelDb}`, () => noiseBand(hz, levelDb), false), this.run(`band${hz}@${levelDb}`, () => noiseBand(hz, levelDb), true)]);
    return rmsDb(w[0], SR) - rmsDb(d[0], SR);
  }
  async sineGainDb(hz: number, levelDb = -30): Promise<number> {
    const [d, w] = await Promise.all([this.run(`sine${hz}@${levelDb}`, () => sine(hz, levelDb), false), this.run(`sine${hz}@${levelDb}`, () => sine(hz, levelDb), true)]);
    return rmsDb(w[0], SR) - rmsDb(d[0], SR);
  }
  /** Harmonics 2..6 of a sine, dB below the fundamental at the output. */
  async thdDb(hz: number, levelDb = -12): Promise<number> {
    const w = await this.run(`sine${hz}@${levelDb}`, () => sine(hz, levelDb), true);
    const from = SR, to = SR * 3;
    const f = toneDb(w[0], hz, from, to);
    let h = 0; for (let k = 2; k <= 6; k++) if (hz * k < SR / 2.2) h += 10 ** (toneDb(w[0], hz * k, from, to) / 10);
    return 10 * Math.log10(h + 1e-12) - f;
  }
  /** Compression: a sine at `hz` stepped -40 dBFS -> `hiDb`; the step in dB minus the rise of the output. */
  async staticGrDb(hz = 1000, hiDb = -10): Promise<number> {
    const mk = () => { const x = new Float32Array(SR * 4); for (let i = 0; i < x.length; i++) x[i] = (i < SR * 2 ? 10 ** (-40 / 20) : 10 ** (hiDb / 20)) * Math.sin(2 * Math.PI * hz * i / SR); return x; };
    const key = `step${hz}@${hiDb}`;
    const [d, w] = await Promise.all([this.run(key, mk, false), this.run(key, mk, true)]);
    const lo = rmsDb(w[0], SR, SR * 2) - rmsDb(d[0], SR, SR * 2);
    const hi = rmsDb(w[0], SR * 3, SR * 4) - rmsDb(d[0], SR * 3, SR * 4);
    return lo - hi;
  }
  async crestDeltaDb(): Promise<number> {
    const [d, w] = await Promise.all([this.run('loop', () => drumLoop(), false), this.run('loop', () => drumLoop(), true)]);
    return crestDb(w[0]) - crestDb(d[0]);
  }
  async bassVsRestDb(): Promise<number> {
    const [d, w] = await Promise.all([this.run('loop', () => drumLoop(), false), this.run('loop', () => drumLoop(), true)]);
    const split = (x: Float32Array) => { const u = lowpass(x, 500); return { low: lowpass(x, 150), rest: x.map((v, i) => v - u[i]) as Float32Array }; };
    const a = split(d[0]), b = split(w[0]);
    return (rmsDb(b.low, SR) - rmsDb(a.low, SR)) - (rmsDb(b.rest, SR) - rmsDb(a.rest, SR));
  }
  /** A 150 ms noise burst; returns ms until the envelope is 40 dB under the burst, and the level (dB re burst) 200 ms after it ends. */
  async tail(): Promise<{ ms40: number; after200Db: number; stereoCorr: number }> {
    const mk = () => { seedState = 4242; const x = new Float32Array(SR * 9); for (let i = 0; i < SR * 0.15; i++) x[i] = 0.3 * rnd(); return x; };
    const w = await this.run('burst', mk, true);
    const win = Math.round(SR * 0.01);
    const env: number[] = [];
    for (let i = 0; i + win <= w[0].length; i += win) { let s = 0; for (let k = i; k < i + win; k++) s += w[0][k] ** 2 + w[1][k] ** 2; env.push(10 * Math.log10(s / (2 * win) + 1e-14)); }
    const burstDb = Math.max(...env.slice(0, 15));
    let ms40 = 150; // the last 10 ms frame still within 40 dB of the burst (the tail length)
    for (let i = 15; i < env.length; i++) if (env[i] > burstDb - 40) ms40 = i * 10;
    const after200Db = env[15 + 20] - burstDb;
    let xy = 0, xx = 0, yy = 0; for (let i = SR * 0.3 | 0; i < SR * 1.5; i++) { xy += w[0][i] * w[1][i]; xx += w[0][i] ** 2; yy += w[1][i] ** 2; }
    return { ms40, after200Db, stereoCorr: xy / Math.sqrt(xx * yy + 1e-24) };
  }

  /**
   * Repeats: a 20 ms noise blip, 5 ms frames. echo = the loudest frame 60 ms - 1.6 s after the blip, dB under it;
   * clarity = that frame over the median of the window, dB (a distinct repeat stands out, a reverb wash does not).
   */
  async echo(): Promise<{ echo: number; clarity: number }> {
    const mk = () => { seedState = 4243; const x = new Float32Array(SR * 4); for (let i = 0; i < SR * 0.02; i++) x[i] = 0.5 * rnd(); return x; };
    const w = await this.run('blip', mk, true);
    const win = Math.round(SR * 0.005), env: number[] = [];
    for (let i = 0; i + win <= w[0].length; i += win) { let e = 0; for (let k = i; k < i + win; k++) e += w[0][k] ** 2 + w[1][k] ** 2; env.push(10 * Math.log10(e / (2 * win) + 1e-14)); }
    const peak = Math.max(...env.slice(0, 4));
    const seg = env.slice(4 + 12, 4 + 12 + 320);
    const sorted = [...seg].sort((p, q) => p - q);
    const top = sorted[sorted.length - 1];
    return { echo: top - peak, clarity: top - sorted[Math.floor(sorted.length / 2)] };
  }
  async echoDb(): Promise<number> { return (await this.echo()).echo; }
  /** Tail energy of a 500 Hz noise-band burst: the octave above (1 kHz) minus the source band, dB. Above -3 = an ascending (shimmer) tail. */
  async shimmerRatioDb(): Promise<number> {
    const mk = () => noiseBand(500, -12, 9).map((v, i) => (i < SR * 0.3 ? v : 0)) as Float32Array;
    const w = await this.run('shimmer', mk, true);
    const from = Math.round(SR * 0.6), to = Math.round(SR * 3);
    const band = (hz: number) => { const y = biquadBandpass(biquadBandpass(w[0], hz, 4.3), hz, 4.3); return rmsDb(y, from, to); };
    return band(1000) - band(500);
  }
  /** What the chain makes out of silence: RMS in dBFS after 1 s (crackle, hiss, rain). */
  async noiseDb(): Promise<number> {
    const w = await this.run('silence', () => new Float32Array(SR * 4), true);
    return Math.max(rmsDb(w[0], SR), rmsDb(w[1], SR));
  }
  /**
   * Modulation of a steady 1 kHz sine at -20 dBFS: quadrature demodulation at 1 kHz,
   * 20 ms smoothing. amDb = the swing of the amplitude (tremolo, auto-pan, wah, filter sweep),
   * fmHz = the peak-to-peak swing of the instantaneous frequency (vibrato, chorus, phaser).
   */
  async modulation(hz = 1000): Promise<{ amDb: number; fmHz: number }> {
    const key = `mod${hz}`;
    const w = await this.run(key, () => sine(hz, -20, 4), true);
    const x = w[0], n = x.length, win = Math.round(SR * 0.02);
    const I = new Float32Array(n), Q = new Float32Array(n);
    for (let i = 0; i < n; i++) { const ph = 2 * Math.PI * hz * i / SR; I[i] = x[i] * Math.cos(ph); Q[i] = -x[i] * Math.sin(ph); }
    const smooth = (a: Float32Array): Float32Array => { const o = new Float32Array(n); let acc = 0; for (let i = 0; i < n; i++) { acc += a[i]; if (i >= win) acc -= a[i - win]; o[i] = acc / Math.min(i + 1, win); } return o; };
    const Is = smooth(I), Qs = smooth(Q);
    let amin = 1e9, amax = 0, fmin = 1e9, fmax = -1e9, prev = 0;
    for (let i = SR; i < n; i++) {
      const a = Math.hypot(Is[i], Qs[i]), ph = Math.atan2(Qs[i], Is[i]);
      amin = Math.min(amin, a); amax = Math.max(amax, a);
      if (i > SR) { let d = ph - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; const f = d * SR / (2 * Math.PI); if (i > SR + win) { fmin = Math.min(fmin, f); fmax = Math.max(fmax, f); } }
      prev = ph;
    }
    return { amDb: 20 * Math.log10((amax + 1e-12) / (amin + 1e-12)), fmHz: fmax - fmin };
  }
  /** The loudest frequency of the output for a sine at `hz` (pitch shift, frequency shift), Hz, by a 1 Hz-resolution scan. */
  async peakHz(hz = 440): Promise<number> {
    const w = await this.run(`peak${hz}`, () => sine(hz, -20, 3), true);
    let best = -Infinity, at = 0;
    for (let f = 20; f < 8000; f += f < 1000 ? 2 : 10) { const v = toneDb(w[0], f, SR, SR * 3); if (v > best) { best = v; at = f; } }
    return at;
  }
  /** Peak dBFS of the drum loop pushed 12 dB hot: the ceiling a limiter holds. */
  async ceilingDb(): Promise<number> {
    const hot = () => drumLoop().map((v) => v * 4) as Float32Array;
    const w = await this.run('hotloop', hot, true);
    return peakDb(w[0]);
  }
  /**
   * Stereo width of a half-correlated stereo noise (side at -9 dB re mid): side/mid ratio of the output
   * minus that of the input, dB. Positive = wider. (renderChain feeds mono, so this builds its own stereo input.)
   */
  async widthDb(): Promise<number> {
    const mk = (): Stereo => {
      seedState = 99; const n = SR * 4, a = new Float32Array(n), b = new Float32Array(n);
      for (let i = 0; i < n; i++) { const m = rnd() * 0.1, sd = rnd() * 0.035; a[i] = m + sd; b[i] = m - sd; }
      return [a, b];
    };
    const [d, w] = await Promise.all([renderStereo(null, mk(), 0), renderStereo(this.fxs, mk(), this.makeUpDb)]);
    const ratio = (o: Stereo) => { const m = o[0].map((v, i) => (v + o[1][i]) / 2) as Float32Array, sd = o[0].map((v, i) => (v - o[1][i]) / 2) as Float32Array; return rmsDb(sd, SR) - rmsDb(m, SR); };
    return ratio(w) - ratio(d);
  }
  /** Auto-pan: a steady 1 kHz sine; the swing of the left/right level difference over 3 s, dB (0 = a fixed image). */
  async panSwingDb(): Promise<number> {
    const w = await this.run('mod1000', () => sine(1000, -20, 4), true);
    const win = Math.round(SR * 0.02);
    let lo = 1e9, hi = -1e9;
    for (let i = SR; i + win < w[0].length; i += win) {
      let l = 0, r = 0; for (let k = i; k < i + win; k++) { l += w[0][k] ** 2; r += w[1][k] ** 2; }
      const d = 10 * Math.log10((l + 1e-12) / (r + 1e-12)); lo = Math.min(lo, d); hi = Math.max(hi, d);
    }
    return hi - lo;
  }
}

/** Like renderChain, with a stereo input. */
export async function renderStereo(fxs: readonly Fx[] | null, input: Stereo, makeUpDb = 0): Promise<Stereo> {
  await setup();
  const Tone = await import('tone');
  await import('@/engine/registry/effects');
  const { createEffect } = await import('@/engine/factories/EffectFactory');
  const n = input[0].length;
  const ctx = new OfflineAudioContext(2, n, SR);
  Tone.setContext(ctx as never);
  const src = ctx.createBufferSource();
  const buf = ctx.createBuffer(2, n, SR);
  buf.copyToChannel(new Float32Array(input[0]), 0); buf.copyToChannel(new Float32Array(input[1]), 1);
  src.buffer = buf;
  let last: unknown = src;
  if (fxs) for (const [i, fx] of fxs.filter((e) => e.enabled !== false).entries()) {
    const node = await createEffect({ id: `rig-${i}`, enabled: true, ...fx } as never);
    Tone.connect(last as never, node as never); last = node;
  }
  if (makeUpDb) { const g = ctx.createGain(); g.gain.value = 10 ** (makeUpDb / 20); Tone.connect(last as never, g as never); last = g; }
  Tone.connect(last as never, ctx.destination as never);
  await audioLoadsSettled(400, 20000);
  if (fxs?.some((e) => e.category !== 'tonejs')) await realDelay(1500);
  src.start();
  const out = await ctx.startRendering();
  return [out.getChannelData(0).slice(), out.getChannelData(1).slice()];
}