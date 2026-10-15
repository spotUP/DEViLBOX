/**
 * Curve models against the REAL klystrack WASM (Klystrack.worklet.js + Klystrack.wasm through the headless
 * worklet harness): every expected number below is measured from audio the engine renders, not computed by the
 * model under test.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer, stereoOutputs } from '@/engine/__tests__/workletHarness';
import { klysTransform } from '@/engine/klystrack/KlysEngine';
import { KLYS_PARAM_IDS } from '@/engine/klystrack/klysInstrumentFields';
import * as M from '../klysCurveModels';

type Worklet = Awaited<ReturnType<typeof startWorklet>>;
const SONG = 'public/data/songs/klystrack/Ocean Loader III.kt';
const SR = 48000;
const INST = 3;
const BLOCK = 128;

async function engine(): Promise<Worklet> {
  const w = await startWorklet('klystrack', 'Klystrack', klysTransform);
  await w.send({ type: 'loadSong', buffer: songBuffer(SONG) });
  await w.send({ type: 'stop' });
  return w;
}
async function set(w: Worklet, key: keyof typeof KLYS_PARAM_IDS, value: number): Promise<void> {
  await w.send({ type: 'setInstrumentParam', idx: INST, paramId: KLYS_PARAM_IDS[key], value });
}
/** Render `seconds` of the left channel, a whole number of blocks. */
function render(w: Worklet, seconds: number): Float32Array {
  const blocks = Math.ceil(seconds * SR / BLOCK);
  const out = stereoOutputs(1, BLOCK);
  const l = new Float32Array(blocks * BLOCK);
  for (let b = 0; b < blocks; b++) { w.proc.process([], out); l.set(out[0][0], b * BLOCK); }
  return l;
}
function windowRms(x: Float32Array, win: number): number[] {
  const r: number[] = [];
  for (let i = 0; i + win <= x.length; i += win) {
    let s = 0;
    for (let k = 0; k < win; k++) s += x[i + k] ** 2;
    r.push(Math.sqrt(s / win));
  }
  return r;
}


/** In-place radix-2 FFT magnitude spectrum of a Hann-windowed signal; returns magnitudes of bins 0..n/2. */
function spectrum(x: Float32Array): Float64Array {
  const n = x.length;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / n));
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
      }
    }
  }
  const mag = new Float64Array(n / 2 + 1);
  for (let i = 0; i <= n / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}
const FFT_N = 1 << 16;
/** Peak magnitude within +-3 bins of `hz`. */
function peakNear(mag: Float64Array, hz: number): number {
  const c = Math.round(hz * FFT_N / SR);
  let m = 0;
  for (let b = Math.max(1, c - 3); b <= Math.min(mag.length - 1, c + 3); b++) m = Math.max(m, mag[b]);
  return m;
}


/** Upward zero crossings (sample positions, linearly interpolated) of x with its mean removed. */
function upCrossings(x: Float32Array): number[] {
  let mean = 0;
  for (const v of x) mean += v;
  mean /= x.length;
  const c: number[] = [];
  for (let i = 1; i < x.length; i++) {
    const a = x[i - 1] - mean, b = x[i] - mean;
    if (a < 0 && b >= 0) c.push(i - 1 + -a / (b - a));
  }
  return c;
}



interface Rig { w: Worklet; tickHz: number }
async function rig(): Promise<Rig> {
  const w = await engine();
  const rate = (w.posted as unknown as Array<{ type?: string; songRate?: number }>).find((m) => m.type === 'songLoaded')!.songRate!;
  expect(rate, 'the song reports its tick rate').toBeGreaterThan(0);
  return { w, tickHz: M.engineTickHz(rate, SR) };
}
async function configure(w: Worklet, params: Partial<Record<keyof typeof KLYS_PARAM_IDS, number>>): Promise<void> {
  for (const [k, v] of Object.entries(params) as Array<[keyof typeof KLYS_PARAM_IDS, number]>) await set(w, k, v);
}
const HELD = { flags: 0, progPeriod: 0, volume: 60, 'adsr.a': 0, 'adsr.d': 0, 'adsr.s': 31, 'adsr.r': 0 } as const;

/** Index of the first window at or after `from` whose value satisfies `f`, as seconds; -1 when none. */
function firstAt(r: number[], win: number, f: (v: number) => boolean, from = 0): number {
  for (let i = from; i < r.length; i++) if (f(r[i])) return i * win / SR;
  return -1;
}

describe('adsrEnvelope against the engine (cyd.c envspd, cyd_cycle_adsr, cyd_env_output)', () => {
  // The envelope is read from the RMS of a held saw: RMS of an unfiltered saw is proportional to the envelope gain.
  const WIN = 734; // 15.3 ms = four periods of the 261.5 Hz C-4 saw, so the window ripple stays small
  const cases: Array<{ a: number; d: number; s: number; r: number }> = [
    { a: 10, d: 14, s: 16, r: 12 },
    { a: 7, d: 20, s: 24, r: 8 },
    { a: 14, d: 8, s: 6, r: 16 },
  ];
  for (const c of cases) {
    it(`a${c.a} d${c.d} s${c.s} r${c.r}: stage times and the whole gain curve match the rendered note`, { timeout: 120000 }, async () => {
      const { w } = await rig();
      await configure(w, { ...HELD, cydflags: 8, 'adsr.a': c.a, 'adsr.d': c.d, 'adsr.s': c.s, 'adsr.r': c.r, volume: 128 });
      const model = M.adsrEnvelope(c.a, c.d, c.s, c.r, SR, 0.5);
      const holdUntil = Math.ceil((model.attackSeconds + model.decaySeconds + 0.5) * 10) / 10;
      await w.send({ type: 'previewNoteOn', inst: INST, note: 48 });
      const held = render(w, holdUntil);
      await w.send({ type: 'previewNoteOff' });
      const tail = render(w, model.releaseSeconds + 0.5);
      const rh = windowRms(held, WIN), rt = windowRms(tail, WIN);
      const all = rh.concat(rt);
      const peak = Math.max(...all);
      const norm = all.map((v) => v / peak);

      // Attack: the measured RMS peaks when the model's attack ends.
      const tPeak = norm.indexOf(1) * WIN / SR + WIN / 2 / SR;
      expect(Math.abs(tPeak - model.attackSeconds) / model.attackSeconds, `peak at ${tPeak}s, model ${model.attackSeconds}s`).toBeLessThan(0.06);
      // Sustain level relative to the peak.
      const susMeasured = rh[rh.length - 3] / peak;
      expect(Math.abs(susMeasured - model.sustainGain / model.peakGain), `sustain ${susMeasured} vs ${model.sustainGain / model.peakGain}`).toBeLessThan(0.02);
      // Decay: the time the gain first falls below the midpoint between peak and sustain.
      const mid = (1 + model.sustainGain / model.peakGain) / 2;
      const tDecayMeasured = firstAt(norm, WIN, (v) => v <= mid, norm.indexOf(1)) + WIN / 2 / SR;
      const tDecayModel = model.points.find((p) => p.x > model.attackSeconds && p.y / model.peakGain <= mid)!.x;
      expect(Math.abs(tDecayMeasured - tDecayModel), `decay midpoint ${tDecayMeasured}s vs model ${tDecayModel}s`).toBeLessThan(0.03 + 0.05 * tDecayModel);
      // Release: the time from note-off until the gain is under 10 percent of the peak.
      const rel10 = firstAt(rt.map((v) => v / peak), WIN, (v) => v < 0.1) + WIN / 2 / SR;
      const rel10Model = model.points.find((p) => p.x > model.releaseAtSeconds && p.y / model.peakGain < 0.1)!.x - model.releaseAtSeconds;
      expect(Math.abs(rel10 - rel10Model), `release to 10 percent ${rel10}s vs model ${rel10Model}s`).toBeLessThan(0.03 + 0.05 * rel10Model);
      // The whole curve: mean absolute error against the rendered RMS, sampled at the window centres of the held part.
      let err = 0, cnt = 0;
      for (let i = 0; i < rh.length; i++) {
        const t = (i + 0.5) * WIN / SR;
        if (t > model.releaseAtSeconds) break;
        let g = 0;
        for (const p of model.points) { if (p.x > t) break; g = p.y; }
        err += Math.abs(norm[i] - g / model.peakGain); cnt++;
      }
      expect(err / cnt, `mean abs gain error ${err / cnt}`).toBeLessThan(0.03);
    });
  }

  it('a sustain of 0 decays straight into the release and the note ends at the decay time', { timeout: 120000 }, async () => {
    const { w } = await rig();
    await configure(w, { ...HELD, cydflags: 8, volume: 128, 'adsr.a': 0, 'adsr.d': 18, 'adsr.s': 0, 'adsr.r': 30 });
    const model = M.adsrStages(0, 18, 0, 30, SR);
    expect(model.releaseSeconds).toBe(0);
    await w.send({ type: 'previewNoteOn', inst: INST, note: 48 });
    const r = windowRms(render(w, model.decaySeconds + 0.4), WIN);
    const peak = Math.max(...r);
    const tEnd = firstAt(r, WIN, (v) => v < 0.02 * peak, r.indexOf(peak)) + WIN / 2 / SR;
    const env = M.adsrEnvelope(0, 18, 0, 30, SR);
    const tEndModel = env.points.find((p) => p.x > 0.01 && p.y < 0.02 * env.peakGain)!.x;
    expect(Math.abs(tEnd - tEndModel) / tEndModel, `under 2 percent at ${tEnd}s, model ${tEndModel}s`).toBeLessThan(0.05);
    expect(r[r.length - 1], 'silent once the decay is over').toBeLessThan(0.002 * peak);
  });
});

describe('filterResponse against the engine (cydflt_set_coeff, cydflt_cycle)', () => {
  // A held saw is rendered with the filter off, then on; each harmonic's amplitude ratio is the filter gain there.
  // Above about 5 kHz the harmonic bins also carry the saw's own aliased components, so the comparison stops there
  // (measured: the model and the engine agree to 0.1 dB up to 5 kHz and drift apart by 1-4 dB above 8 kHz).
  const FFT_LIMIT_HZ = 5000;
  it('matches the filter gain at the harmonics for low pass, high pass, band pass and with resonance', { timeout: 240000 }, async () => {
    const { w } = await rig();
    await configure(w, { ...HELD, volume: 40, resonance: 0, flttype: 0, cutoff: 2047 });
    const measure = async (cydflags: number): Promise<Float64Array> => {
      await set(w, 'cydflags', cydflags);
      await w.send({ type: 'previewNoteOn', inst: INST, note: 48 });
      render(w, 0.4);
      const x = render(w, FFT_N / SR + 0.01).subarray(0, FFT_N);
      await w.send({ type: 'previewNoteOff' });
      render(w, 0.2);
      return spectrum(x);
    };
    const ref = await measure(8);
    let best = 0, bi = 0;
    for (let i = 20; i < 2000; i++) if (ref[i] > best) { best = ref[i]; bi = i; }
    const f0 = bi * SR / FFT_N;
    const grid: Array<[number, number, 0 | 1 | 2]> = [[300, 0, 0], [600, 0, 0], [1000, 0, 0], [1000, 0, 1], [1000, 0, 2], [900, 2, 0], [900, 3, 0], [500, 3, 1]];
    let worst = 0, compared = 0, worstAt = '';
    for (const [cutoff, resonance, type] of grid) {
      await configure(w, { cutoff, resonance, flttype: type });
      const m = await measure(8 | 512);
      for (let k = 1; k * f0 < FFT_LIMIT_HZ; k += Math.ceil(k / 6)) {
        const model = M.linearToDb(M.filterGain(cutoff, resonance, type, k * f0, SR));
        if (model < -42) continue; // below the aliasing floor of the measurement
        const meas = 20 * Math.log10(peakNear(m, k * f0) / peakNear(ref, k * f0));
        const e = Math.abs(meas - model);
        compared++;
        if (e > worst) { worst = e; worstAt = `cutoff ${cutoff} res ${resonance} type ${type} at ${Math.round(k * f0)} Hz: engine ${meas.toFixed(2)} dB, model ${model.toFixed(2)} dB`; }
      }
    }
    expect(compared, 'enough points were comparable').toBeGreaterThan(60);
    expect(worst, `worst error ${worst.toFixed(2)} dB over ${compared} points: ${worstAt}`).toBeLessThan(0.2);
  });

  it('filterResponse is the same gain on a log axis: 20 Hz..20 kHz, one point per step, low pass falling', () => {
    const lp = M.filterResponse(600, 0, 0, SR, 64);
    expect(lp).toHaveLength(64);
    expect(lp[0].x).toBeCloseTo(20, 6);
    expect(lp[63].x).toBeLessThan(SR / 2);
    expect(lp[0].y).toBeGreaterThan(-1);
    expect(lp[63].y).toBeLessThan(-12);
    for (let i = 1; i < lp.length; i++) expect(lp[i].y).toBeLessThanOrEqual(lp[i - 1].y + 1e-9);
    const hp = M.filterResponse(600, 0, 1, SR, 64);
    expect(hp[0].y).toBeLessThan(-40);
    expect(M.filterPeakHz(900, 3, 0, SR)).toBeGreaterThan(1000);
  });
});

describe('lfoShape against the engine (mus_shape, vibrato in music.c:1399, do_pwm music.c:1121)', () => {
  it('vibrato: cycle length and swing of a rendered triangle note match the model, for sine and ramp', { timeout: 120000 }, async () => {
    const { w, tickHz } = await rig();
    for (const [shape, speed, depth] of [[0, 32, 200], [1, 24, 100]] as const) {
      await configure(w, { ...HELD, flags: 4, cydflags: 4, vibDelay: 0, vibShape: shape, vibratoSpeed: speed, vibratoDepth: depth });
      await w.send({ type: 'previewNoteOn', inst: INST, note: 48 });
      render(w, 0.1);
      const x = render(w, 1.6);
      await w.send({ type: 'previewNoteOff' });
      render(w, 0.1);
      const c = upCrossings(x);
      const f = c.slice(1).map((v, i) => SR / (v - c[i]));
      const t = c.slice(1).map((v) => v / SR);
      const swing = 12 * Math.log2(Math.max(...f) / Math.min(...f));
      const model = M.lfoShape(shape, speed, depth, 2, 'vibrato', tickHz);
      const ys = model.points.map((p) => p.y);
      const modelSwing = Math.max(...ys) - Math.min(...ys);
      expect(Math.abs(swing - modelSwing) / modelSwing, `shape ${shape}: swing ${swing} semitones, model ${modelSwing}`).toBeLessThan(0.05);
      // Cycle: spacing of the upward crossings of the frequency through its mean.
      const mean = (Math.max(...f) + Math.min(...f)) / 2;
      const mc: number[] = [];
      for (let i = 1; i < f.length; i++) if (f[i - 1] < mean && f[i] >= mean) mc.push(t[i - 1] + (mean - f[i - 1]) / (f[i] - f[i - 1]) * (t[i] - t[i - 1]));
      const per = (mc[mc.length - 1] - mc[0]) / (mc.length - 1);
      expect(Math.abs(per - model.cycleSeconds) / model.cycleSeconds, `shape ${shape}: cycle ${per}s, model ${model.cycleSeconds}s`).toBeLessThan(0.03);
    }
  });

  it('pulse width modulation: the duty alternates between the two values the model gives, at the model cycle length', { timeout: 120000 }, async () => {
    const { w, tickHz } = await rig();
    const speed = 32, depth = 40, pw = 1024;
    await configure(w, { ...HELD, flags: 16, cydflags: 2, pw, pwmShape: 4, pwmSpeed: speed, pwmDepth: depth });
    await w.send({ type: 'previewNoteOn', inst: INST, note: 48 });
    render(w, 0.1);
    const x = render(w, 1.6);
    const { duty, at } = dutySeries(x);
    const sorted = [...duty].sort((a, b) => a - b);
    const lo = sorted[Math.floor(sorted.length * 0.05)], hi = sorted[Math.floor(sorted.length * 0.95)];
    const model = M.lfoShape(4, speed, depth, 2, 'pwm', tickHz);
    const ys = model.points.map((p) => p.y);
    const dutyHi = M.pulseDutyHigh(pw + Math.min(...ys)), dutyLo = M.pulseDutyHigh(pw + Math.max(...ys));
    expect(Math.abs(hi - dutyHi), `high duty ${hi} vs ${dutyHi}`).toBeLessThan(0.01);
    expect(Math.abs(lo - dutyLo), `low duty ${lo} vs ${dutyLo}`).toBeLessThan(0.01);
    const mid = (lo + hi) / 2;
    const rises: number[] = [];
    for (let i = 1; i < duty.length; i++) if (duty[i - 1] < mid && duty[i] >= mid) rises.push(at[i]);
    const per = (rises[rises.length - 1] - rises[0]) / (rises.length - 1);
    expect(Math.abs(per - model.cycleSeconds) / model.cycleSeconds, `cycle ${per}s, model ${model.cycleSeconds}s`).toBeLessThan(0.05);
  });

  it('random shape: UNMEASURED against audio (the table is a fixed pseudo-random list); structural checks only', () => {
    const c = M.lfoShape(3, 40, 100, 3, 'vibrato', 50);
    expect(c.points.length).toBeGreaterThan(8);
    expect(c.peak).toBeGreaterThan(0);
    expect(c.peak).toBeLessThanOrEqual(128 * 100 / 64 / 256 + 1e-9);
    expect(M.lfoShapeValue(0, 3)).toBe(110); // rnd_table[0], music.c:48
    expect(M.lfoShapeValue(8, 3)).toBe(-1); // rnd_table[1]: the position is divided by 8
  });

  it('speed 0 does not move, delay shrinks the depth, the cycle length formula is 256 / speed ticks', () => {
    expect(M.lfoShape(0, 0, 100).points).toHaveLength(1);
    const d = M.lfoShape(4, 40, 100, 2, 'vibrato', 50, 10);
    expect(Math.abs(d.points[1].y)).toBeLessThan(Math.abs(d.points[d.points.length - 1].y) + 1e-12);
    expect(M.lfoCycleSeconds(32, 50)).toBeCloseTo(0.16, 9);
    expect(M.lfoCycleSeconds(0)).toBe(Infinity);
  });
});

/** Duty (high fraction) of every period of a rendered pulse wave, and the time of each. */
function dutySeries(x: Float32Array): { duty: number[]; at: number[] } {
  let lo = Infinity, hi = -Infinity;
  for (const v of x) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const th = (lo + hi) / 2;
  const duty: number[] = [], at: number[] = [];
  let up = -1, down = -1;
  for (let i = 1; i < x.length; i++) {
    const a = x[i - 1] > th, b = x[i] > th;
    if (!a && b) { if (up >= 0 && down > up) { duty.push((down - up) / (i - up)); at.push(up / SR); } up = i; }
    if (a && !b) down = i;
  }
  return { duty, at };
}

describe('pulseWave and oscillatorCycle against the engine (cydosc.c)', () => {
  it('the pulse duty of a rendered note follows pulseDutyHigh(pw)', { timeout: 120000 }, async () => {
    const { w } = await rig();
    await configure(w, { ...HELD, flags: 16, cydflags: 2, pwmDepth: 0, pwmSpeed: 0 });
    for (const pw of [256, 1024, 1800]) {
      await set(w, 'pw', pw);
      await w.send({ type: 'previewNoteOn', inst: INST, note: 48 });
      render(w, 0.1);
      const { duty } = dutySeries(render(w, 1));
      await w.send({ type: 'previewNoteOff' });
      render(w, 0.1);
      const mean = duty.reduce((a, b) => a + b, 0) / duty.length;
      expect(Math.abs(mean - M.pulseDutyHigh(pw)), `pw ${pw}: engine duty ${mean}, model ${M.pulseDutyHigh(pw)}`).toBeLessThan(0.005);
      const wave = M.pulseWave(pw, 256);
      const highFraction = wave.filter((p) => p.y > 0).length / wave.length;
      expect(Math.abs(highFraction - mean), `pulseWave high fraction ${highFraction}`).toBeLessThan(0.01);
    }
  });

  it('saw, triangle, saw AND pulse: one rendered cycle (folded at the measured pitch) correlates with the model cycle', { timeout: 120000 }, async () => {
    const { w } = await rig();
    await configure(w, { ...HELD, flags: 16, pw: 700, pwmDepth: 0, pwmSpeed: 0 });
    for (const flags of [8, 4, 8 | 2, 4 | 2]) {
      await set(w, 'cydflags', flags);
      await w.send({ type: 'previewNoteOn', inst: INST, note: 48 });
      render(w, 0.1);
      const x = render(w, 1);
      await w.send({ type: 'previewNoteOff' });
      render(w, 0.1);
      const c = upCrossings(x);
      const period = (c[c.length - 1] - c[0]) / (c.length - 1) * (flags & 8 ? 1 : 0.5); // triangle crosses twice per cycle
      void period;
      // Fold the render on the pitch: the average spacing of the first-harmonic zero crossings is the period.
      const T = (c[c.length - 1] - c[0]) / (c.length - 1);
      const bins = 64;
      const sum = new Float64Array(bins), n = new Float64Array(bins);
      for (let i = 0; i < x.length; i++) {
        const ph = (((i - c[0]) / T) % 1 + 1) % 1;
        const b = Math.floor(ph * bins);
        sum[b] += x[i]; n[b]++;
      }
      const folded = Array.from(sum, (v, i) => v / n[i]);
      const model = M.oscillatorCycle(flags, 700, bins).points.map((p) => p.y);
      expect(M.oscillatorCycle(flags, 700, bins).modelled).toBe(true);
      // Best circular shift (the fold starts at an arbitrary phase), Pearson correlation.
      const corr = (a: number[], b: number[], shift: number): number => {
        const ma = a.reduce((p, q) => p + q, 0) / a.length, mb = b.reduce((p, q) => p + q, 0) / b.length;
        let sab = 0, saa = 0, sbb = 0;
        for (let i = 0; i < a.length; i++) { const da = a[i] - ma, db = b[(i + shift) % b.length] - mb; sab += da * db; saa += da * da; sbb += db * db; }
        return sab / Math.sqrt(saa * sbb);
      };
      let best = -1;
      for (let s = 0; s < bins; s++) best = Math.max(best, corr(folded, model, s));
      expect(best, `cydflags ${flags}: correlation ${best}`).toBeGreaterThan(0.97);
    }
  });

  it('noise in the mix is flagged non-deterministic, wavetable and LFSR as unmodelled, no waveform is silence', () => {
    expect(M.oscillatorCycle(1, 0).deterministic).toBe(false);
    expect(M.oscillatorCycle(8, 0).deterministic).toBe(true);
    expect(M.oscillatorCycle(M.OSC_WAVETABLE, 0).modelled).toBe(false);
    expect(M.oscillatorCycle(M.OSC_LFSR | 8, 0).modelled).toBe(false);
    expect(M.oscillatorCycle(0, 0).points.every((p) => p.y === 0)).toBe(true);
  });
});

describe('unit helpers', () => {
  it('log axis helpers round-trip and stage steps are monotonic in slope', () => {
    expect(M.logXToHz(M.hzToLogX(440))).toBeCloseTo(440, 6);
    expect(M.hzToLogX(20)).toBeCloseTo(0, 9);
    expect(M.hzToLogX(20000)).toBeCloseTo(1, 9);
    for (let k = 1; k < 63; k++) expect(M.envelopeStep(k + 1, SR)).toBeLessThanOrEqual(M.envelopeStep(k, SR));
    expect(M.envelopeStep(0, SR)).toBeGreaterThan(M.envelopeStep(1, SR));
    expect(M.engineTickHz(55, SR)).toBeCloseTo(48000 / 872, 9);
  });
});
