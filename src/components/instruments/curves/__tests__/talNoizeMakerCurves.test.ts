/**
 * TAL-NoiseMaker curves against the real engine (worklet + WASM in Node): the choice-parameter scale, the default patch,
 * the envelope law of Adsr::tick, the cutoff the filter receives, the ladder filter family, the LFO rate and shape, and
 * the oscillator shapes.
 */
import { describe, it, expect } from 'vitest';
import { makeRig, SAMPLE_RATE, toneLevel, db, type Rig } from './wasmRig';
import { TalNMParam as P, DEFAULT_TAL_NM_PARAMS, TAL_NOIZEMAKER_PRESETS, CONFIG_TO_INDEX } from '@/engine/tal-noizemaker/TalNoizeMakerSynth';
import {
  talAdsr, talFinalCutoff, talFilterDb, talComboItem, talComboValue, talLfoHz, talLfoTrueHz, talLfoPoints, talWaveValue, talVoice,
  talLogScaledVolume, talCutoffHz, TAL_FILTER_TYPES, TAL_OSC1_WAVES, TAL_OSC2_WAVES,
} from '../talNoizeMakerCurves';

async function rigWith(params: Record<number, number> = {}): Promise<Rig> {
  const rig = await makeRig('tal-noisemaker', 'TalNoizeMaker');
  for (const [i, v] of Object.entries(params)) await rig.send({ type: 'setParam', index: Number(i), value: v });
  await rig.send({ type: 'watchVoices', on: true });
  return rig;
}
/** A note that goes down at `at` seconds (the engine has a settling block or two at start). */
const noteAt = (rig: Rig, note: number, at = 0.05, off?: number) => {
  let on = false, released = false;
  return async (t: number): Promise<void> => {
    if (!on && t >= at) { on = true; await rig.send({ type: 'noteOn', note, velocity: 127 }); }
    if (off !== undefined && on && !released && t >= off) { released = true; await rig.send({ type: 'noteOff', note }); }
  };
};
/** Osc::process: getMidiNoteInHertz(note) * 2 with the engine's note scale (A440 at 81): plain equal temperament. */
const freqOfOsc = (note: number, tune = 0): number => 440 * Math.pow(2, (note + tune - 69) / 12);

describe('TAL-NoiseMaker choice parameters and the default patch', () => {
  it('item k of n is (k - 1) / (n - 1) and the engine reads it back', () => {
    for (const n of [3, 5, 6, 8, 12]) for (let k = 1; k <= n; k++) expect(talComboItem(talComboValue(k, n), n)).toBe(k);
    // the old layout options 0, 1, 2, 3 for 12 filter types read as items 1, 12, 23, 34
    expect([0, 1, 2, 3].map((v) => talComboItem(v, 12))).toEqual([1, 12, 23, 34]);
  });

  it('the default patch makes sound (envelope editor destination Off, not Volume)', async () => {
    const rig = await rigWith();
    const { audio } = await rig.render(0.6, noteAt(rig, 60));
    expect(Math.max(...audio.map(Math.abs)), 'peak of the default patch').toBeGreaterThan(0.05);
    // the old default 1.0 selected the last item, Volume, with an empty envelope: silence
    const old = await rigWith({ [P.ENVELOPEEDITORDEST1]: 1.0 });
    const { audio: silent } = await old.render(0.6, noteAt(old, 60));
    expect(Math.max(...silent.map(Math.abs))).toBeLessThan(1e-6);
  });

  it('the editor\'s own defaults, sent parameter by parameter as the engine class does, make sound and keep the filter on', async () => {
    const rig = await makeRig('tal-noisemaker', 'TalNoizeMaker');
    for (const [i, v] of Object.entries(DEFAULT_TAL_NM_PARAMS)) await rig.send({ type: 'setParam', index: Number(i), value: v });
    const { audio } = await rig.render(0.6, noteAt(rig, 60));
    expect(Math.max(...audio.map(Math.abs)), 'peak of the editor default patch').toBeGreaterThan(0.05);
    expect(talComboItem(DEFAULT_TAL_NM_PARAMS[P.FILTERTYPE], 12), 'default filter type is item 1, not the bypass').toBe(1);
    expect(talComboItem(DEFAULT_TAL_NM_PARAMS[P.ENVELOPEEDITORDEST1], 8), 'default envelope editor destination is Off').toBe(1);
  });

  it('the filter type option values select the filter they name (item 1 is not the bypass)', async () => {
    const level = async (type: number): Promise<number> => {
      const rig = await rigWith({ [P.FILTERTYPE]: talComboValue(type, 12), [P.CUTOFF]: 0.3, [P.OSC1WAVEFORM]: 0, [P.OSC3VOLUME]: 0, [P.OSC1TUNE]: 0.5 });
      const { audio } = await rig.render(0.6, noteAt(rig, 84));
      return Math.max(...audio.subarray(Math.floor(SAMPLE_RATE * 0.3)).map(Math.abs));
    };
    const lp24 = await level(1);
    const bypass = await level(12);
    expect(bypass, 'bypass passes a saw at note 84 with its full level').toBeGreaterThan(lp24 * 2);
  });
});

describe('TAL-NoiseMaker envelope model against the engine', () => {
  it('amplitude, filter and free AD envelopes follow the reported voice (absolute level)', async () => {
    const a = { attack: 0.5, decay: 0.45, sustain: 0.55, release: 0.4 };
    const f = { attack: 0.4, decay: 0.5, sustain: 0.6, release: 0.3 };
    const rig = await rigWith({
      [P.AMPATTACK]: a.attack, [P.AMPDECAY]: a.decay, [P.AMPSUSTAIN]: a.sustain, [P.AMPRELEASE]: a.release,
      [P.FILTERATTACK]: f.attack, [P.FILTERDECAY]: f.decay, [P.FILTERSUSTAIN]: f.sustain, [P.FILTERRELEASE]: f.release,
      [P.FREEADATTACK]: 0.5, [P.FREEADDECAY]: 0.5,
    });
    // the key is released 4.2 s after the voice starts: model it with the hold that puts the release there
    const keyOff = 4.2;
    const withKeyOff = (k: Parameters<typeof talAdsr>[0], fast: boolean) => {
      const probe = talAdsr(k, SAMPLE_RATE, { fasterAttack: fast, hold: 0, capSeconds: 8 });
      return talAdsr(k, SAMPLE_RATE, { fasterAttack: fast, hold: keyOff - probe.env.decayEnd, capSeconds: 8 });
    };
    const amp = withKeyOff(a, false);
    const fenv = withKeyOff({ ...f, sustain: talLogScaledVolume(f.sustain) }, true);
    const free = withKeyOff({ attack: 0.5, decay: 0.5, sustain: 0, release: 1 }, true);
    const { reports } = await rig.render(5.4, noteAt(rig, 60, 0.05, keyOff + 0.05));
    const errs = { amp: 0, filter: 0, free: 0 };
    let n = 0;
    for (const r of reports) {
      const v = r.voices[0];
      if (!v || v.stage === 'off') continue;
      const t = talVoice(v);
      // the model's key goes down at its own `releaseAt`, measured from the voice's start
      if (v.elapsedSeconds > amp.env.releaseAt) continue;
      errs.amp = Math.max(errs.amp, Math.abs(amp.levelAt(v.elapsedSeconds) - t.ampLevel));
      errs.filter = Math.max(errs.filter, Math.abs(fenv.levelAt(v.elapsedSeconds) - t.filterLevel));
      errs.free = Math.max(errs.free, Math.abs(free.levelAt(v.elapsedSeconds) - t.freeLevel));
      n++;
    }
    expect(n).toBeGreaterThan(100);
    if (process.env.CURVE_STATS) console.log(`STAT tal envelope: amp ${errs.amp.toFixed(4)} filter ${errs.filter.toFixed(4)} free ${errs.free.toFixed(4)} over ${n} reports`);
    expect(errs.amp, 'amplitude level, absolute error').toBeLessThan(0.02);
    expect(errs.filter, 'filter level, absolute error').toBeLessThan(0.02);
    expect(errs.free, 'free AD level, absolute error').toBeLessThan(0.02);
  });

  it('the release follows the modelled fall (level against time since key off)', async () => {
    const a = { attack: 0.3, decay: 0.3, sustain: 0.7, release: 0.5 };
    const rig = await rigWith({ [P.AMPATTACK]: a.attack, [P.AMPDECAY]: a.decay, [P.AMPSUSTAIN]: a.sustain, [P.AMPRELEASE]: a.release });
    const keyOff = 3.0;
    const probe = talAdsr(a, SAMPLE_RATE, { hold: 0, capSeconds: 10 });
    const run = talAdsr(a, SAMPLE_RATE, { hold: keyOff - probe.env.decayEnd, capSeconds: 10 });
    const { reports } = await rig.render(8, noteAt(rig, 60, 0.05, keyOff + 0.05));
    const errs: number[] = [];
    for (const r of reports) {
      const v = r.voices[0];
      if (!v || v.stage !== 'release') continue;
      errs.push(Math.abs(run.levelAt(v.elapsedSeconds) - talVoice(v).ampLevel));
    }
    expect(errs.length).toBeGreaterThan(5);
    if (process.env.CURVE_STATS) console.log(`STAT tal release: worst ${Math.max(...errs).toFixed(4)} over ${errs.length} reports`);
    expect(Math.max(...errs)).toBeLessThan(0.03);
  });

  it('the cutoff the filter receives is ((base + key follow + velocity + contour * envelope)^2), clamped', async () => {
    const knobs: Record<string, number> = { cutoff: 0.55, keyFollow: 0.6, filterContour: 0.8, velocityCutoff: 0.3, velocityContour: 0.4, filterAttack: 0.3, filterDecay: 0.4, filterSustain: 0.5 };
    const rig = await rigWith({
      [P.CUTOFF]: knobs.cutoff, [P.KEYFOLLOW]: knobs.keyFollow, [P.FILTERCONTOUR]: knobs.filterContour, [P.VELOCITYCUTOFF]: knobs.velocityCutoff,
      [P.VELOCITYCONTOUR]: knobs.velocityContour, [P.FILTERATTACK]: knobs.filterAttack, [P.FILTERDECAY]: knobs.filterDecay, [P.FILTERSUSTAIN]: knobs.filterSustain,
    });
    const get = (k: string): number => knobs[k] ?? 0;
    const { reports } = await rig.render(2.0, noteAt(rig, 50));
    const errs: number[] = [];
    for (const r of reports) {
      const v = r.voices[0];
      // the engine low-passes the cutoff knob (cutoffFiltered); compare once it settled
      if (!v || r.t < 0.8) continue;
      errs.push(Math.abs(talFinalCutoff(get, { note: 50, envelope: v.filterLevel }) - v.cutoff));
    }
    expect(errs.length).toBeGreaterThan(30);
    if (process.env.CURVE_STATS) console.log(`STAT tal cutoff chain: worst ${Math.max(...errs).toFixed(5)}`);
    expect(Math.max(...errs), 'final cutoff, absolute error').toBeLessThan(0.003);
  });
});

describe('TAL-NoiseMaker filter model against the engine output', () => {
  /** Gain of a sine through the filter, in dB, against the same patch with the filter bypassed (type 12). */
  async function measured(note: number, base: Record<number, number>): Promise<{ gainDb: number; cutoff: number; hz: number }> {
    const patch = {
      // a small input (volume 0.5 is a gain of 0.2): the ladder soft-clips its output, the model is small-signal
      [P.OSC1VOLUME]: 0, [P.OSC2VOLUME]: 0.5, [P.OSC3VOLUME]: 0, [P.OSC2WAVEFORM]: talComboValue(4, 5), [P.OSC2TUNE]: 0.5,
      [P.FILTERCONTOUR]: 0.5, [P.VELOCITYCUTOFF]: 0, [P.VELOCITYCONTOUR]: 0, [P.KEYFOLLOW]: 0, [P.VOLUME]: 0.5, ...base,
    };
    const run = async (type: number): Promise<{ audio: Float32Array; cutoff: number }> => {
      const rig = await rigWith({ ...patch, [P.FILTERTYPE]: talComboValue(type, 12) });
      const { audio, reports } = await rig.render(1.0, noteAt(rig, note));
      return { audio, cutoff: reports.at(-1)!.voices[0].cutoff };
    };
    const type = Math.round(base[P.FILTERTYPE]);
    const on = await run(type);
    const off = await run(12);
    const hz = freqOfOsc(note);
    const seg = (a: Float32Array): Float32Array => a.subarray(Math.floor(SAMPLE_RATE * 0.5), Math.floor(SAMPLE_RATE * 0.95));
    // the bypass (type 12) is not neutral: the handler scales types above 10 by 3 (4 / 4 * 3), so the filter's own gain is 3 times the ratio
    return { gainDb: db(toneLevel(seg(on.audio), hz)) - db(toneLevel(seg(off.audio), hz)) + 20 * Math.log10(3), cutoff: on.cutoff, hz };
  }

  const NOTES = [36, 48, 60, 72, 84, 96, 104];
  it.each([
    ['LP 24', 1, 0.6, 0.0], ['LP 24 resonant', 1, 0.5, 0.4], ['LP 18', 2, 0.6, 0.2], ['LP 12', 3, 0.6, 0.2], ['LP 6', 4, 0.6, 0.0],
    ['HP', 5, 0.45, 0.0], ['BP', 6, 0.5, 0.2], ['Notch', 7, 0.5, 0.0], ['Moog 24', 11, 0.6, 0.0],
  ] as const)('%s: modelled gain at sine frequencies matches the engine', async (name, type, cutoff, reso) => {
    const errs: string[] = [];
    let worst = 0, compared = 0;
    for (const note of NOTES) {
      // each case sets the cutoff knob; the engine's final cutoff is what the report says, the model takes it from there
      const m = await measured(note, { [P.FILTERTYPE]: type, [P.CUTOFF]: cutoff, [P.RESONANCE]: reso });
      const model = talFilterDb(type, m.cutoff, reso, m.hz, SAMPLE_RATE)!;
      if (model < -40 && m.gainDb < -40) continue;
      compared++;
      worst = Math.max(worst, Math.abs(model - m.gainDb));
      errs.push(`${m.hz.toFixed(0)} Hz: engine ${m.gainDb.toFixed(2)} dB, model ${model.toFixed(2)} dB`);
    }
    if (process.env.CURVE_STATS) console.log(`STAT tal filter ${name}: worst ${worst.toFixed(2)} dB over ${compared} frequencies\n${errs.join('\n')}`);
    expect(compared).toBeGreaterThanOrEqual(3);
    expect(worst, 'worst error, dB').toBeLessThan(1.5);
  }, 60000);

  it('the filter corner in Hz grows with the cutoff, and the names match the engine types', () => {
    expect(talCutoffHz(1, 0.5, SAMPLE_RATE)).toBeGreaterThan(talCutoffHz(1, 0.2, SAMPLE_RATE));
    expect(TAL_FILTER_TYPES).toHaveLength(12);
    expect(talFilterDb(12, 0.5, 0.3, 1000, SAMPLE_RATE)).toBe(0);
    expect(talFilterDb(9, 0.5, 0.3, 1000, SAMPLE_RATE)).toBeNull();
  });
});

describe('TAL-NoiseMaker LFO model against the engine', () => {
  it.each([[0.5], [0.6]] as const)('LFO 1 RATE %f runs at Hz * 256 / 255 (engine phase over time)', async (rate) => {
    const rig = await rigWith({ [P.LFO1RATE]: rate });
    const { reports } = await rig.render(2.5, noteAt(rig, 60, 0.02));
    const settled = reports.filter((r) => r.voices[0] && r.t >= 0.3);
    let cycles = 0, last = talVoice(settled[0].voices[0]).lfo1Phase;
    for (const r of settled.slice(1)) {
      const p = talVoice(r.voices[0]).lfo1Phase;
      cycles += (((p - last) % 1) + 1) % 1;
      last = p;
    }
    const hz = cycles / (settled.at(-1)!.t - settled[0].t);
    if (process.env.CURVE_STATS) console.log(`STAT tal lfo rate ${rate}: ${hz.toFixed(3)} Hz vs ${talLfoTrueHz(rate).toFixed(3)}`);
    expect(Math.abs(hz / talLfoTrueHz(rate) - 1)).toBeLessThan(0.01);
  });

  it.each([[0, 'sine'], [1, 'triangle'], [2, 'saw'], [3, 'square']] as const)('LFO 2 shape %i (%s) drives the volume as the drawn cycle says', async (index, _name) => {
    void _name;
    const rate = 0.55;
    const rig = await rigWith({
      [P.LFO2WAVEFORM]: index / 5, [P.LFO2RATE]: rate, [P.LFO2AMOUNT]: 1, [P.LFO2DESTINATION]: talComboValue(6, 8),
      [P.OSC1VOLUME]: 0, [P.OSC2VOLUME]: 1, [P.OSC3VOLUME]: 0, [P.OSC2WAVEFORM]: talComboValue(4, 5), [P.OSC2TUNE]: 0.5, [P.FILTERTYPE]: talComboValue(12, 12),
    });
    let on = false;
    const { audio, reports } = await rig.render(1.6, async (t) => { if (!on && t >= 0.05) { on = true; await rig.send({ type: 'noteOn', note: 69, velocity: 127 }); } });
    // peak of a 4 ms window every 1 ms; the model is evaluated at the window's centre
    const win = Math.floor(SAMPLE_RATE * 0.004), hop = Math.floor(SAMPLE_RATE * 0.001);
    const env: number[] = [];
    for (let at = 0; at + win <= audio.length; at += hop) { let m = 0; for (let i = 0; i < win; i++) m = Math.max(m, Math.abs(audio[at + i])); env.push(m); }
    const baseHz = talLfoHz(rate); // reported phase units (table / 256) advance at this many per second
    const cycle = talLfoPoints(index, baseHz, SAMPLE_RATE, 1, 400);
    const at = (x: number): number => cycle[Math.min(cycle.length - 1, Math.floor((((x % 1) + 1) % 1) * (cycle.length - 1)))][1];
    // the engine's own phase at each hop, from the reports (linear in time between them)
    const phases = reports.filter((r) => r.voices[0]).map((r) => [r.t, talVoice(r.voices[0]).lfo2Phase] as const);
    const phaseAt = (t: number): number => {
      let best = phases[0];
      for (const p of phases) if (Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p;
      // the drawn cycle spans the 255 table steps before the wrap, the report divides by 256
      return ((best[1] + (t - best[0]) * baseHz) * 256) / 255;
    };
    // the block that carries a phase report is 2.7 ms long: allow +-3 ms of alignment
    let corr = -1;
    for (let lag = -3; lag <= 3; lag++) {
      const xs: number[] = [], ys: number[] = [];
      for (let i = 400; i < env.length - 10; i++) { xs.push(env[i]); ys.push(1 - (at(phaseAt(0.002 + (i + lag) * 0.001)) + 1) / 2); }
      const mx = xs.reduce((u, v) => u + v, 0) / xs.length, my = ys.reduce((u, v) => u + v, 0) / ys.length;
      let sxy = 0, sxx = 0, syy = 0;
      xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
      corr = Math.max(corr, sxy / Math.sqrt(sxx * syy));
    }
    if (process.env.CURVE_STATS) console.log(`STAT tal lfo shape ${index}: correlation ${corr.toFixed(4)}`);
    // the square wave's edges are sensitive to a millisecond of alignment: 0.955 measured
    expect(corr, 'correlation of the volume envelope with the drawn LFO cycle').toBeGreaterThan(0.94);
  });
});

/** Harmonic amplitudes (dB relative to the first) of one drawn cycle. */
function harmonicsOf(f: (x: number) => number, count: number): number[] {
  const n = 4096;
  const amp = Array.from({ length: count }, (_, h) => {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) { const y = f(i / n); re += y * Math.cos((2 * Math.PI * (h + 1) * i) / n); im += y * Math.sin((2 * Math.PI * (h + 1) * i) / n); }
    return Math.hypot(re, im);
  });
  return amp.map((a) => db(a / amp[0]));
}

describe('TAL-NoiseMaker oscillator shapes against the engine output', () => {
  it.each([
    ['osc 1 saw', 1, 0, 'Saw', 0.5], ['osc 1 pulse 50%', 1, 1, 'Pulse', 0.5], ['osc 1 pulse 30%', 1, 1, 'Pulse', 0.3],
    ['osc 2 triangle', 2, 2, 'Triangle', 0.5],
  ] as const)('%s: measured harmonics match the drawn shape', async (_name, osc, item, wave, pw) => {
    void _name;
    const note = 45;
    const params: Record<number, number> = {
      [P.OSC1VOLUME]: osc === 1 ? 1 : 0, [P.OSC2VOLUME]: osc === 2 ? 1 : 0, [P.OSC3VOLUME]: 0, [P.OSC1TUNE]: 0.5, [P.OSC2TUNE]: 0.5, [P.OSC1PW]: pw,
      [P.OSC1WAVEFORM]: osc === 1 ? talComboValue(item + 1, 3) : 0, [P.OSC2WAVEFORM]: osc === 2 ? talComboValue(item + 1, 5) : 0, [P.FILTERTYPE]: talComboValue(12, 12),
    };
    const rig = await rigWith(params);
    const { audio } = await rig.render(1.0, noteAt(rig, note));
    const f0 = freqOfOsc(note);
    const seg = audio.subarray(Math.floor(SAMPLE_RATE * 0.4), Math.floor(SAMPLE_RATE * 0.95));
    const count = 8;
    const measured = Array.from({ length: count }, (_, h) => db(toneLevel(seg, (h + 1) * f0)));
    const model = harmonicsOf((x) => talWaveValue(wave, x, pw), count);
    const diffs: number[] = [];
    for (let h = 1; h < count; h++) if (model[h] > -40) diffs.push(measured[h] - measured[0] - model[h]);
    expect(diffs.length).toBeGreaterThanOrEqual(3);
    if (process.env.CURVE_STATS) console.log(`STAT tal wave ${_name}: worst ${Math.max(...diffs.map(Math.abs)).toFixed(2)} dB`);
    for (const d of diffs) expect(Math.abs(d), 'harmonic level against the shape, dB').toBeLessThan(1.0);
  });
});

describe('TAL-NoiseMaker voice report through the real worklet', () => {
  it('posts 12-float records that talVoice decodes', async () => {
    const rig = await rigWith({ [P.AMPSUSTAIN]: 0.5 });
    const { reports } = await rig.render(0.8, noteAt(rig, 64));
    const v = reports.at(-1)!.voices[0];
    expect(v.note).toBe(64);
    expect(v.extra).toHaveLength(4);
    const t = talVoice(v);
    expect(t.ampStage).toBe('sustain');
    expect(t.ampLevel).toBeCloseTo(0.5, 2);
    expect(t.freeStage).toBe('sustain');
  });
});

describe('TAL-NoiseMaker hand-written presets sound as named', () => {
  /** What each preset's oscillators were meant to be (the old raw scale: 1.0 saw, 0.5 pulse, 0.0 noise / sine). */
  const INTENT: Record<string, { osc1?: string; osc2?: string }> = {
    'Fat Bass': { osc1: 'Saw' }, 'Acid Squelch': { osc1: 'Pulse' }, 'SuperSaw Lead': { osc1: 'Saw', osc2: 'Saw' }, 'Lush Pad': { osc2: 'Pulse' },
    'Wobble Bass': { osc1: 'Saw' }, 'Trance Pad': { osc1: 'Saw', osc2: 'Saw' }, 'Pluck Bass': { osc1: 'Pulse' }, 'Noise Hit': { osc1: 'Noise', osc2: 'Saw' },
    'Bit Crush': { osc1: 'Pulse' }, 'Vintage Keys': { osc1: 'Pulse', osc2: 'Sine' }, 'Detuned Lead': { osc1: 'Saw', osc2: 'Saw' }, 'FM Stab': { osc1: 'Pulse', osc2: 'Sine' },
    'Dark Bass': { osc1: 'Saw' }, 'Ring Bell': { osc1: 'Noise', osc2: 'Sine' }, 'Sync Scream': { osc1: 'Saw', osc2: 'Saw' }, 'Atmospheric': { osc1: 'Saw', osc2: 'Pulse' },
    'Retro Poly': { osc1: 'Pulse', osc2: 'Saw' }, 'Distorted Mono': { osc1: 'Saw', osc2: 'Pulse' }, 'Pulsating': { osc1: 'Pulse', osc2: 'Pulse' },
  };
  const names = Object.keys(TAL_NOIZEMAKER_PRESETS).filter((n) => n !== 'Init');

  it('the preset table holds the 19 hand-written presets (plus Init)', () => { expect(names.length).toBe(19); });

  it.each(names)('%s: the oscillator choices read back as named, and rendering it through the worklet makes sound', async (name) => {
    const preset = TAL_NOIZEMAKER_PRESETS[name];
    const want = INTENT[name];
    if (want?.osc1 && preset.osc1Waveform !== undefined) expect(TAL_OSC1_WAVES[talComboItem(preset.osc1Waveform, 3) - 1], `${name} osc 1`).toBe(want.osc1);
    if (want?.osc2 && preset.osc2Waveform !== undefined) expect(TAL_OSC2_WAVES[talComboItem(preset.osc2Waveform, 5) - 1], `${name} osc 2`).toBe(want.osc2);
    if (preset.filterType !== undefined) expect(talComboItem(preset.filterType, 12), `${name} filter type`).toBeLessThan(8);
    const rig = await makeRig('tal-noisemaker', 'TalNoizeMaker');
    const params: Record<number, number> = { ...DEFAULT_TAL_NM_PARAMS };
    for (const [k, v] of Object.entries(preset)) if (CONFIG_TO_INDEX[k] !== undefined && typeof v === 'number') params[CONFIG_TO_INDEX[k]] = v;
    for (const [i, v] of Object.entries(params)) await rig.send({ type: 'setParam', index: Number(i), value: v });
    const { audio } = await rig.render(1.0, noteAt(rig, 57));
    expect(Math.max(...audio.map(Math.abs)), `${name} peak`).toBeGreaterThan(0.02);
  });
});
