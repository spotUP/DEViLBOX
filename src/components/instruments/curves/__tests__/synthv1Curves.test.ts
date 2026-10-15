/**
 * SynthV1 curves against the real engine (worklet + WASM in Node): envelope law, the cutoff the filter receives, the
 * filter transfer functions of the three modelled slopes, the oscillator tables, and the LFO rate and shape.
 */
import { describe, it, expect } from 'vitest';
import { makeRig, SAMPLE_RATE, toneLevel, db, type Rig } from './wasmRig';
import {
  synthv1StagedEnvelope, synthv1StageFrames, synthv1EffectiveCutoff, synthv1EffectiveReso, synthv1FilterDb, synthv1CutoffHz, synthv1Wave,
  synthv1LfoHz, synthv1Sigmoid1, synthv1PageVoice, type SynthV1Page,
} from '../synthv1Curves';
import { VOICE_RECORD_FLOATS } from '@/engine/voiceStatus/wasmVoiceStatus';
import { CONFIG_KEYS, WASM_PARAM_INDEX } from '@/engine/synthv1/SynthV1Synth';

// ParamIndex of the first synth page (synthv1.h); the second page is the same list from 59
const P = {
  shape1: 0, width1: 1, balance: 8, detune: 9, shape2: 4,
  dcfEnabled: 16, cutoff: 17, reso: 18, type: 19, slope: 20, dcfAmount: 21, dcfA: 22, dcfD: 23, dcfS: 24, dcfR: 25,
  lfoEnabled: 26, lfoShape: 27, lfoWidth: 28, lfoRate: 30, lfoVolume: 39,
  volume: 44, dcaA: 45, dcaD: 46, dcaS: 47, dcaR: 48,
};
const PAGE2 = 59;

/** Page 2 is silenced (volume 0, as the layout's default config does) unless a test sets its volume; both pages run otherwise. */
async function rigWith(params: Record<number, number>): Promise<Rig> {
  const rig = await makeRig('synthv1', 'SynthV1');
  for (const [i, v] of Object.entries({ [PAGE2 + P.volume]: 0, ...params })) await rig.send({ type: 'setParam', index: Number(i), value: v });
  await rig.send({ type: 'watchVoices', on: true });
  return rig;
}
const levelAt = (points: Array<[number, number]>, t: number): number => {
  for (let i = 1; i < points.length; i++) if (points[i][0] >= t) { const [x0, y0] = points[i - 1], [x1, y1] = points[i]; return x1 === x0 ? y1 : y0 + ((y1 - y0) * (t - x0)) / (x1 - x0); }
  return points[points.length - 1][1];
};
const key2hz = (note: number): number => (440 / 32) * Math.pow(2, (note - 9) / 12);

describe('SynthV1 envelope model against the engine', () => {
  it('held amplitude and filter envelopes follow the reported voice (absolute level), for both pages', async () => {
    for (const page of [1, 2] as SynthV1Page[]) {
      const o = page === 1 ? 0 : PAGE2;
      const k = { attack: 0.3, decay: 0.25, sustain: 0.6, release: 0.2 };
      const f = { attack: 0.2, decay: 0.3, sustain: 0.4, release: 0.2 };
      const rig = await rigWith({
        [o + P.dcaA]: k.attack, [o + P.dcaD]: k.decay, [o + P.dcaS]: k.sustain, [o + P.dcaR]: k.release,
        [o + P.dcfA]: f.attack, [o + P.dcfD]: f.decay, [o + P.dcfS]: f.sustain, [o + P.dcfR]: f.release,
        [o + P.dcfAmount]: 1, [o + P.cutoff]: 0.8,
      });
      // the key is released at 1.4 s: hold both sustains until then
      const decayEnd = (kn: typeof k): number => (synthv1StageFrames(kn.attack, 'attack', SAMPLE_RATE) + synthv1StageFrames(kn.decay, 'decay', SAMPLE_RATE)) / SAMPLE_RATE;
      const amp = synthv1StagedEnvelope(k, SAMPLE_RATE, 1.4 - decayEnd(k));
      const fenv = synthv1StagedEnvelope(f, SAMPLE_RATE, 1.4 - decayEnd(f));
      let off = -1;
      const { reports } = await rig.render(2.6, async (t) => {
        if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 100 });
        if (off < 0 && t >= 1.4) { off = t; await rig.send({ type: 'noteOff', note: 60 }); }
      });
      const ae: number[] = [], fe: number[] = [], ce: number[] = [];
      for (const r of reports) {
        if (!r.voices[0]) continue;
        const v = r.voices[0];
        const pv = synthv1PageVoice(v, page);
        if (pv.stage === 'off' || v.elapsedSeconds <= 0) continue;
        if (pv.stage !== 'release') {
          ae.push(Math.abs(levelAt(amp.points, v.elapsedSeconds) - pv.level));
          if (pv.filterStage !== 'release') fe.push(Math.abs(levelAt(fenv.points, v.elapsedSeconds) - pv.filterLevel));
        }
        ce.push(Math.abs(synthv1EffectiveCutoff(0.8, 1, pv.filterLevel) - pv.cutoff));
      }
      if (process.env.CURVE_STATS) console.log(`STAT synthv1 envelope page ${page}: amp ${Math.max(...ae).toFixed(4)} filter ${Math.max(...fe).toFixed(4)} cutoff ${Math.max(...ce).toFixed(5)}`);
      expect(ae.length).toBeGreaterThan(40);
      expect(Math.max(...ae), `page ${page} amplitude level, absolute error`).toBeLessThan(0.03);
      expect(Math.max(...fe), `page ${page} filter level, absolute error`).toBeLessThan(0.03);
      expect(Math.max(...ce), `page ${page} reported cutoff against sigmoid_1(cutoff * env)`).toBeLessThan(0.005);
    }
  });

  it('the release runs knob^2 of the longest stage as an ease-out (level against time since key off)', async () => {
    const k = { attack: 0.05, decay: 0.1, sustain: 0.7, release: 0.35 };
    const rig = await rigWith({ [P.dcaA]: k.attack, [P.dcaD]: k.decay, [P.dcaS]: k.sustain, [P.dcaR]: k.release });
    const env = synthv1StagedEnvelope(k, SAMPLE_RATE, 0.5);
    let off = -1;
    const { reports } = await rig.render(1.4, async (t) => {
      if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 100 });
      if (off < 0 && t >= 0.5) { off = t; await rig.send({ type: 'noteOff', note: 60 }); }
    });
    const errs: number[] = [];
    for (const r of reports) {
      const v = r.voices[0];
      if (!v || v.stage !== 'release') continue;
      errs.push(Math.abs(levelAt(env.points, env.releaseAt + (r.t - off)) - v.level));
    }
    expect(errs.length).toBeGreaterThan(10);
    expect(Math.max(...errs), 'release level, absolute error').toBeLessThan(0.05);
    // 0.35^2 of 5 s = 612 ms, and the units: the knob is not a percentage of anything linear
    expect(synthv1StageFrames(0.35, 'release', SAMPLE_RATE) / SAMPLE_RATE).toBeCloseTo(0.6125, 3);
    expect(synthv1StageFrames(0, 'attack', SAMPLE_RATE) / SAMPLE_RATE).toBeCloseTo(0.0005, 5);
    expect(synthv1StageFrames(0, 'decay', SAMPLE_RATE) / SAMPLE_RATE).toBeCloseTo(0.002, 5);
  });
});

describe('SynthV1 filter model against the engine output', () => {
  /** Gain of a sine through the filter at `note`, in dB, against the same patch with the filter off. */
  async function measured(note: number, base: Record<number, number>): Promise<{ gainDb: number; cutoff: number; hz: number }> {
    const patch = {
      [P.shape1]: 2, [P.shape2]: 2, [P.detune]: 0, [P.balance]: 0, [P.lfoEnabled]: 0,
      [P.dcfAmount]: 1, [P.dcfA]: 0, [P.dcfD]: 0, [P.dcfS]: 1, [P.dcaA]: 0, [P.dcaD]: 0, [P.dcaS]: 1, ...base,
    };
    const run = async (enabled: number): Promise<{ audio: Float32Array; cutoff: number }> => {
      const rig = await rigWith({ ...patch, [P.dcfEnabled]: enabled });
      const { audio, reports } = await rig.render(1.0, async (t) => { if (t === 0) await rig.send({ type: 'noteOn', note, velocity: 100 }); });
      return { audio, cutoff: reports.at(-1)!.voices[0].cutoff };
    };
    const on = await run(1);
    const off = await run(0);
    const hz = key2hz(note);
    const seg = (a: Float32Array): Float32Array => a.subarray(Math.floor(SAMPLE_RATE * 0.4), Math.floor(SAMPLE_RATE * 0.9));
    return { gainDb: db(toneLevel(seg(on.audio), hz)) - db(toneLevel(seg(off.audio), hz)), cutoff: on.cutoff, hz };
  }

  const NOTES = [36, 48, 60, 72, 84, 96, 108, 120];
  it.each([
    ['12 dB low pass', 0, 0, 0.5, 0.3, 1.0],
    ['12 dB high pass', 0, 2, 0.5, 0.3, 1.0],
    ['12 dB band pass', 0, 1, 0.4, 0.5, 1.0],
    ['12 dB notch', 0, 3, 0.4, 0.1, 1.0],
    ['24 dB low pass', 1, 0, 0.5, 0.1, 1.5],
    ['24 dB high pass (pass band only: the ladder\'s cubic clip leaks about -20 dB into its stop band)', 1, 2, 0.1, 0.1, 1.5],
    ['Biquad low pass', 2, 0, 0.5, 0.6, 1.0],
    ['Biquad high pass', 2, 2, 0.1, 0.2, 1.0],
  ] as const)('%s: modelled gain at eight sine frequencies matches the engine', async (_name, slope, type, cutoff, reso, tolerance) => {
    void _name;
    const errs: string[] = [];
    let compared = 0, worst = 0;
    for (const note of NOTES) {
      const m = await measured(note, { [P.slope]: slope, [P.type]: type, [P.cutoff]: cutoff, [P.reso]: reso });
      const r = synthv1EffectiveReso(reso, 1, 1);
      const model = synthv1FilterDb(slope, type, m.cutoff, r, m.hz, SAMPLE_RATE)!;
      // a deep stop band is below the engine's float noise floor: compare only where either is above -45 dB; the
      // ladder's high pass is x - clip(b4), so its stop band floors at the clip's distortion (the model is small-signal)
      if (model < -45 && m.gainDb < -45) continue;
      if (slope === 1 && type !== 0 && model < -6) continue;
      compared++;
      worst = Math.max(worst, Math.abs(model - m.gainDb));
      if (Math.abs(model - m.gainDb) > tolerance) errs.push(`note ${note} (${m.hz.toFixed(0)} Hz): engine ${m.gainDb.toFixed(2)} dB, model ${model.toFixed(2)} dB`);
    }
    if (process.env.CURVE_STATS) console.log(`STAT synthv1 filter ${_name.slice(0, 24)}: worst ${worst.toFixed(2)} dB over ${compared} frequencies`);
    expect(compared, 'frequencies compared').toBeGreaterThanOrEqual(2);
    expect(errs, 'filter response, engine against model').toEqual([]);
  }, 60000);

  it('the cutoff in Hz is the pole frequency: the response of each slope falls to its corner level at it', () => {
    const fs = SAMPLE_RATE;
    // low pass, no resonance: the biquad corner is -3 dB at cutoff * fs / 2; the one-pole ladder section is -3 dB at its corner
    const c = 0.3;
    expect(synthv1CutoffHz(2, c, 0, fs)).toBeCloseTo(7200, 0);
    expect(synthv1FilterDb(2, 0, c, 0, synthv1CutoffHz(2, c, 0, fs), fs)!).toBeCloseTo(0, 0);
    expect(synthv1Sigmoid1(0.5)).toBeCloseTo(0.5, 6);
    expect(synthv1Sigmoid1(1)).toBeCloseTo(0.995, 6);
    expect(synthv1CutoffHz(0, 0.1, 0.3, fs)).toBeLessThan(synthv1CutoffHz(0, 0.5, 0.3, fs));
  });
});

/** Harmonic amplitudes (dB relative to the first) of a drawn cycle. */
function wavHarmonics(points: Array<[number, number]>, count: number): number[] {
  const n = points.length - 1;
  const amp = Array.from({ length: count }, (_, h) => {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) { re += points[i][1] * Math.cos((2 * Math.PI * (h + 1) * i) / n); im += points[i][1] * Math.sin((2 * Math.PI * (h + 1) * i) / n); }
    return Math.hypot(re, im);
  });
  return amp.map((a) => db(a / amp[0]));
}

describe('SynthV1 oscillator tables against the engine output', () => {
  it.each([
    ['saw', 1, 1], ['saw with width 0.3', 1, 0.3], ['pulse', 0, 0.5], ['pulse with width 0.2', 0, 0.2], ['sine bent by width 0.5', 2, 0.5],
  ] as const)('%s: measured harmonics match the table the engine builds', async (_name, shape, width) => {
    void _name;
    const rig = await rigWith({ [P.shape1]: shape, [P.width1]: width, [P.balance]: -1, [P.detune]: 0, [P.dcfEnabled]: 0, [P.lfoEnabled]: 0, [P.dcaA]: 0, [P.dcaD]: 0, [P.dcaS]: 1 });
    const { audio } = await rig.render(0.9, async (t) => { if (t === 0) await rig.send({ type: 'noteOn', note: 45, velocity: 100 }); });
    const f0 = key2hz(45);
    const seg = audio.subarray(Math.floor(SAMPLE_RATE * 0.3), Math.floor(SAMPLE_RATE * 0.9));
    const harmonics = 8;
    const measured = Array.from({ length: harmonics }, (_, h) => db(toneLevel(seg, (h + 1) * f0)));
    const model = wavHarmonics(synthv1Wave(shape, width, false, 4096).points, harmonics);
    const diffs: number[] = [];
    for (let h = 1; h < harmonics; h++) if (model[h] > -40) diffs.push(measured[h] - measured[0] - model[h]);
    expect(diffs.length).toBeGreaterThanOrEqual(3);
    if (process.env.CURVE_STATS) console.log(`STAT synthv1 wave ${_name}: worst ${Math.max(...diffs.map(Math.abs)).toFixed(2)} dB`);
    for (const d of diffs) expect(Math.abs(d), 'harmonic level against the model, dB').toBeLessThan(0.6);
  });
});

describe('SynthV1 LFO against the engine', () => {
  it.each([[0.3], [0.7]] as const)('RATE %f runs at BPM / (60.01 - rate * 60) Hz (engine LFO phase over time)', async (rate) => {
    const rig = await rigWith({ [P.lfoRate]: rate, [P.dcaS]: 1, [P.dcaA]: 0 });
    const { reports } = await rig.render(2.0, async (t) => { if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 100 }); });
    // skip the first 0.3 s: the engine glides a changed rate over 32 blocks (synthv1_port2)
    const settled = reports.filter((r) => r.t >= 0.3);
    let cycles = 0, last = settled[0].voices[0].lfoPhase;
    for (const r of settled.slice(1)) {
      const p = r.voices[0].lfoPhase;
      cycles += (((p - last) % 1) + 1) % 1;
      last = p;
    }
    const measuredHz = cycles / (settled.at(-1)!.t - settled[0].t);
    if (process.env.CURVE_STATS) console.log(`STAT synthv1 lfo rate ${rate}: ${measuredHz.toFixed(3)} Hz vs ${synthv1LfoHz(rate).toFixed(3)}`);
    expect(Math.abs(measuredHz / synthv1LfoHz(rate) - 1)).toBeLessThan(0.005);
  });

  it.each([[0, 'pulse', 0.5], [1, 'saw', 1], [2, 'sine', 1]] as const)('shape %i (%s) drives the volume as the table says', async (shape, _name, width) => {
    void _name;
    const rate = 0; // 3 Hz
    const rig = await rigWith({
      [P.shape1]: 2, [P.shape2]: 2, [P.detune]: 0, [P.balance]: 0, [P.dcfEnabled]: 0, [P.lfoShape]: shape, [P.lfoWidth]: width,
      [P.lfoRate]: rate, [P.lfoVolume]: 0.8, [P.dcaA]: 0, [P.dcaD]: 0, [P.dcaS]: 1,
    });
    // the engine starts a voice at the phase of the table it holds BEFORE the block's table switch, so the first block after
    // a shape change would start the LFO from the previous table's phase: play the note a block later, as a player does
    let started = 0;
    const { audio } = await rig.render(1.4, async (t) => { if (!started && t >= 0.05) { started = t; await rig.send({ type: 'noteOn', note: 69, velocity: 100 }); } });
    // amplitude envelope of the 440 Hz tone: peak per 4 ms hop
    const hop = Math.floor(SAMPLE_RATE * 0.004);
    const env: number[] = [];
    for (let at = 0; at + hop <= audio.length; at += hop) { let m = 0; for (let i = 0; i < hop; i++) m = Math.max(m, Math.abs(audio[at + i])); env.push(m); }
    const wave = synthv1Wave(shape, width, true, 1024);
    const hz = synthv1LfoHz(rate);
    const model = (t: number): number => 1 + 0.8 * levelAt(wave.points, (((t - started) * hz) % 1 + 1) % 1);
    const t0 = Math.floor(0.2 / 0.004);
    let best = -1;
    for (let lag = -8; lag <= 8; lag++) {
      const xs: number[] = [], ys: number[] = [];
      for (let i = t0; i < env.length - 10; i++) { xs.push(env[i]); ys.push(model((i + lag) * 0.004)); }
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
      let sxy = 0, sxx = 0, syy = 0;
      xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
      best = Math.max(best, sxy / Math.sqrt(sxx * syy));
    }
    if (process.env.CURVE_STATS) console.log(`STAT synthv1 lfo shape ${shape}: correlation ${best.toFixed(4)}`);
    expect(best, 'correlation of the volume envelope with the drawn LFO shape').toBeGreaterThan(0.97);
  });
});

describe('SynthV1 voice report through the real worklet', () => {
  it('posts 16-float records with the second page in extra, and the markers map them', async () => {
    const rig = await rigWith({ [PAGE2 + P.dcaS]: 0.5 });
    const { reports } = await rig.render(0.5, async (t) => { if (t === 0) await rig.send({ type: 'noteOn', note: 64, velocity: 100 }); });
    const v = reports.at(-1)!.voices[0];
    expect(v.note).toBe(64);
    expect(v.extra).toHaveLength(8);
    expect(v.extra[0]).toBe(64);
    const p2 = synthv1PageVoice(v, 2);
    expect(p2.stage).toBe('sustain');
    expect(p2.level).toBeCloseTo(0.5, 2);
    expect(VOICE_RECORD_FLOATS).toBe(8);
  });
});

describe('SynthV1 layout keys reach the engine parameters they name', () => {
  it('the RATE knobs (lfo1Rate, lfo2Rate) drive LFO_RATE, so the LFO runs at the drawn frequency', async () => {
    for (const [key, page] of [['lfo1Rate', 0], ['lfo2Rate', PAGE2]] as const) {
      const index = WASM_PARAM_INDEX[CONFIG_KEYS.indexOf(key)];
      expect(index, `${key} -> engine parameter`).toBe(page + P.lfoRate);
      // the same path the engine class takes: the layout value 0.3 sent to that parameter
      const rig = await rigWith({ [page + P.volume]: 0.5, [PAGE2 + (page === 0 ? 0 : -PAGE2) + P.volume]: 0, [index]: 0.3, [page + P.dcaS]: 1 });
      const { reports } = await rig.render(2.0, async (t) => { if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 100 }); });
      const settled = reports.filter((r) => r.voices[0] && r.t >= 0.3);
      const phaseOf = (r: (typeof settled)[number]): number => synthv1PageVoice(r.voices[0], page === 0 ? 1 : 2).lfoPhase;
      let cycles = 0, last = phaseOf(settled[0]);
      for (const r of settled.slice(1)) { const p = phaseOf(r); cycles += (((p - last) % 1) + 1) % 1; last = p; }
      const hz = cycles / (settled.at(-1)!.t - settled[0].t);
      expect(Math.abs(hz / synthv1LfoHz(0.3) - 1), `${key}: measured ${hz.toFixed(3)} Hz against ${synthv1LfoHz(0.3).toFixed(3)} Hz`).toBeLessThan(0.01);
    }
  });
});
