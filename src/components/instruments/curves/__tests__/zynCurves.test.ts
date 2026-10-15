/**
 * ZynAddSubFX curves against the real engine (worklet + WASM in Node): the envelope time law and the dB amplitude envelope, the
 * filter envelope in octaves, the cutoff the filter runs at, the analog filter types, and the oscillator base functions.
 */
import { describe, it, expect } from 'vitest';
import { makeZynRig } from './zynRig';
import { SAMPLE_RATE, toneLevel, db, type Rig } from './wasmRig';
import { ZynAddSubFXParam as P } from '@/engine/zynaddsubfx/ZynAddSubFXSynth';
import {
  zynAmpEnvelope, zynFilterEnvelope, zynEnvSeconds, zynEnvStretch, zynNoteHz, zynNoteCutoffHz, zynFilterDb, zynResonanceQ, zynCutoffHz,
  zynOscillatorPoints, zynFilterPeakOctaves, zynOctavesLevel, ZYN_BASE_FUNCTIONS, ZYN_FILTER_TYPES, zynBaseFunction, zynKeyTracking,
} from '../zynCurves';

async function rigWith(params: Record<number, number> = {}): Promise<Rig> {
  const rig = await makeZynRig();
  await rig.send({ type: 'setParamRaw', index: 86, value: 127 }); // forced release, as the engine class sends it
  for (const [i, v] of Object.entries(params)) await rig.send({ type: 'setParam', index: Number(i), value: v });
  await rig.send({ type: 'watchVoices', on: true });
  return rig;
}
const noteAt = (rig: Rig, note: number, at = 0.05, off?: number) => {
  let on = false, released = false;
  return async (t: number): Promise<void> => {
    if (!on && t >= at) { on = true; await rig.send({ type: 'noteOn', note, velocity: 127 }); }
    if (off !== undefined && on && !released && t >= off) { released = true; await rig.send({ type: 'noteOff', note }); }
  };
};
const levelAt = (points: Array<[number, number]>, t: number): number => {
  for (let i = 1; i < points.length; i++) if (points[i][0] >= t) { const [x0, y0] = points[i - 1], [x1, y1] = points[i]; return x1 === x0 ? y1 : y0 + ((y1 - y0) * (t - x0)) / (x1 - x0); }
  return points[points.length - 1][1];
};

describe('ZynAddSubFX envelope model against the engine', () => {
  it('the time law and the amplitude envelope follow the reported voice (absolute level)', async () => {
    const k = { attack: 0.3, decay: 0.35, sustain: 0.6, release: 0.3 };
    const rig = await rigWith({ [P.AMP_ATTACK]: k.attack, [P.AMP_DECAY]: k.decay, [P.AMP_SUSTAIN]: k.sustain, [P.AMP_RELEASE]: k.release });
    const keyOff = 2.0;
    const probe = zynAmpEnvelope(k, 60, SAMPLE_RATE, 0);
    const env = zynAmpEnvelope(k, 60, SAMPLE_RATE, keyOff - probe.decayEnd);
    const { reports } = await rig.render(4.0, noteAt(rig, 60, 0.05, keyOff + 0.05));
    const errs: number[] = [];
    for (const r of reports) {
      const v = r.voices[0];
      if (!v || v.stage === 'off') continue;
      errs.push(Math.abs(levelAt(env.points, v.elapsedSeconds) - v.level));
    }
    expect(errs.length).toBeGreaterThan(60);
    if (process.env.CURVE_STATS) console.log(`STAT zyn amp envelope: worst ${Math.max(...errs).toFixed(4)} mean ${(errs.reduce((a, b) => a + b, 0) / errs.length).toFixed(4)} over ${errs.length}`);
    expect(Math.max(...errs), 'amplitude level, absolute error').toBeLessThan(0.05);
    // the units: attack knob 0.3 is 38 on the 0..127 scale, 0.10 s before the note stretch, not 38 seconds
    expect(zynEnvSeconds(0.3 * 127)).toBeCloseTo(0.1, 1);
    expect(zynEnvStretch(64, zynNoteHz(60))).toBeCloseTo(1.682, 2);
  });

  it('the release plays out (a note off no longer cuts the sound)', async () => {
    const rig = await rigWith({ [P.AMP_ATTACK]: 0, [P.AMP_RELEASE]: 0.45 });
    const { reports } = await rig.render(2.5, noteAt(rig, 60, 0.05, 0.6));
    const released = reports.filter((r) => r.voices[0]?.stage === 'release');
    expect(released.length, 'release reports').toBeGreaterThan(10);
    expect(released[0].voices[0].level).toBeGreaterThan(released.at(-1)!.voices[0].level);
  });

  it('the filter envelope rises to the ENV AMT peak and decays to the centre (octaves), and the cutoff follows it', async () => {
    const amount = 0.8;
    const rig = await rigWith({ [P.FILTER_ENV_AMOUNT]: amount, [P.FILTER_ATTACK]: 0.35, [P.FILTER_DECAY]: 0.45, [P.FILTER_SUSTAIN]: 0.6, [P.FILTER_CUTOFF]: 0.5, [P.FILTER_VELOCITY]: 0, [P.FILTER_KEY_TRACK]: 0.5 });
    const env = zynFilterEnvelope({ attack: 0.35, decay: 0.45, sustain: 0.6, release: 0.3, amount }, SAMPLE_RATE, 5);
    const get = (key: string): number => ({ filterCutoff: 0.5, filterKeyTrack: 0.5, filterEnvAmount: amount } as Record<string, number>)[key] ?? 0;
    const { reports } = await rig.render(4.0, noteAt(rig, 60, 0.05));
    const lvl: number[] = [], cut: number[] = [];
    for (const r of reports) {
      const v = r.voices[0];
      if (!v || v.stage === 'off') continue;
      lvl.push(Math.abs(levelAt(env.points, v.elapsedSeconds) - v.filterLevel));
      const octaves = v.filterLevel * 12 - 6;
      cut.push(Math.abs(Math.log2(v.cutoff / zynNoteCutoffHz(get, 60, octaves))));
    }
    expect(lvl.length).toBeGreaterThan(60);
    if (process.env.CURVE_STATS) console.log(`STAT zyn filter envelope: level worst ${Math.max(...lvl).toFixed(4)}, cutoff worst ${Math.max(...cut).toFixed(4)} octaves`);
    expect(Math.max(...lvl), 'filter envelope level, absolute error').toBeLessThan(0.05);
    expect(Math.max(...cut), 'cutoff against base * 2^(envelope + tracking), octaves').toBeLessThan(0.02);
    expect(zynFilterPeakOctaves(amount)).toBeCloseTo(((64 + Math.round(amount * 63) - 64) / 64) * 6, 6);
    expect(zynOctavesLevel(0)).toBe(0.5);
  });
});

describe('ZynAddSubFX filter model against the engine output', () => {
  /** Level of a sine voice at `note` through the filter, in dB. */
  async function level(note: number, base: Record<number, number>): Promise<number> {
    const patch = {
      [P.ADD_V1_WAVE]: 0, [P.ADD_V1_VOLUME]: 1, [P.FILTER_VELOCITY]: 0, [P.FILTER_KEY_TRACK]: 0.5, [P.FILTER_ENV_AMOUNT]: 0, [P.AMP_ATTACK]: 0, [P.AMP_SUSTAIN]: 1, ...base,
    };
    const rig = await rigWith(patch);
    const { audio } = await rig.render(0.9, noteAt(rig, note));
    return db(toneLevel(audio.subarray(Math.floor(SAMPLE_RATE * 0.35), Math.floor(SAMPLE_RATE * 0.85)), zynNoteHz(note)));
  }
  const NOTES = [48, 60, 72, 84, 96];
  it.each([
    ['Low Pass 1 Pole', 0, 0.5, 0.2], ['High Pass 1 Pole', 1, 0.45, 0.2], ['Low Pass 2 Poles', 2, 0.5, 0.5], ['High Pass 2 Poles', 3, 0.45, 0.5],
    ['Band Pass', 4, 0.5, 0.5], ['Notch', 5, 0.5, 0.5],
  ] as const)('%s: modelled gain at five sine frequencies matches the engine', async (name, type, cutoff, reso) => {
    let worst = 0, compared = 0;
    const lines: string[] = [];
    // the reference is the same voice through a low pass at the top of the knob, whose own model value is subtracted
    for (const note of NOTES) {
      const on = await level(note, { [P.FILTER_TYPE]: type, [P.FILTER_CUTOFF]: cutoff, [P.FILTER_RESONANCE]: reso });
      const ref = await level(note, { [P.FILTER_TYPE]: 2, [P.FILTER_CUTOFF]: 1, [P.FILTER_RESONANCE]: 0 });
      const getFor = (c: number) => (k: string): number => ({ filterCutoff: c, filterKeyTrack: 0.5 } as Record<string, number>)[k] ?? 0;
      const hz = zynNoteHz(note);
      const model = zynFilterDb(type, zynNoteCutoffHz(getFor(cutoff), note, 0), zynResonanceQ(reso), hz, SAMPLE_RATE)
        - zynFilterDb(2, zynNoteCutoffHz(getFor(1), note, 0), zynResonanceQ(0), hz, SAMPLE_RATE);
      const measured = on - ref;
      if (model < -45 && measured < -45) continue;
      compared++;
      worst = Math.max(worst, Math.abs(model - measured));
      lines.push(`${hz.toFixed(0)} Hz: engine ${measured.toFixed(2)} dB, model ${model.toFixed(2)} dB`);
    }
    if (process.env.CURVE_STATS) console.log(`STAT zyn filter ${name}: worst ${worst.toFixed(2)} dB over ${compared}\n${lines.join('\n')}`);
    expect(compared).toBeGreaterThanOrEqual(3);
    expect(worst, 'worst error, dB').toBeLessThan(1.0);
  }, 60000);

  it('the resonance knob never reaches Q 0 (the old linear law divided by zero at the bottom)', async () => {
    expect(zynResonanceQ(0)).toBeCloseTo(0.1, 6);
    const lowest = await level(60, { [P.FILTER_TYPE]: 2, [P.FILTER_CUTOFF]: 0.7, [P.FILTER_RESONANCE]: 0 });
    expect(Number.isFinite(lowest) && lowest > -60, 'a note through the filter at resonance 0 sounds').toBe(true);
    expect(zynCutoffHz(0)).toBeCloseTo(20, 6);
    expect(zynKeyTracking(0.5)).toBeCloseTo(-0.0079, 3);
    expect(ZYN_FILTER_TYPES).toHaveLength(9);
  });
});

/** Harmonic amplitudes (dB relative to the first) of one drawn cycle. */
function harmonicsOf(points: Array<[number, number]>, count: number): number[] {
  const n = points.length - 1;
  const amp = Array.from({ length: count }, (_, h) => {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) { re += points[i][1] * Math.cos((2 * Math.PI * (h + 1) * i) / n); im += points[i][1] * Math.sin((2 * Math.PI * (h + 1) * i) / n); }
    return Math.hypot(re, im);
  });
  return amp.map((a) => db(a / amp[0]));
}

describe('ZynAddSubFX oscillator base functions against the engine output', () => {
  it.each([1, 2, 3, 13] as const)('base function %i (%s): measured harmonics match the drawn cycle', async (index) => {
    const note = 45;
    const rig = await rigWith({ [P.ADD_V1_WAVE]: index, [P.ADD_V1_VOLUME]: 1, [P.FILTER_TYPE]: 2, [P.FILTER_CUTOFF]: 1, [P.FILTER_RESONANCE]: 0, [P.FILTER_VELOCITY]: 0, [P.AMP_ATTACK]: 0, [P.AMP_SUSTAIN]: 1 });
    const { audio } = await rig.render(0.9, noteAt(rig, note));
    const f0 = zynNoteHz(note);
    const seg = audio.subarray(Math.floor(SAMPLE_RATE * 0.35), Math.floor(SAMPLE_RATE * 0.85));
    const count = 8;
    const measured = Array.from({ length: count }, (_, h) => db(toneLevel(seg, (h + 1) * f0)));
    const model = harmonicsOf(zynOscillatorPoints(index, 4096), count);
    const diffs: number[] = [];
    for (let h = 1; h < count; h++) if (model[h] > -40) diffs.push(measured[h] - measured[0] - model[h]);
    if (process.env.CURVE_STATS) console.log(`STAT zyn wave ${ZYN_BASE_FUNCTIONS[index]}: worst ${diffs.length ? Math.max(...diffs.map(Math.abs)).toFixed(2) : 'n/a'} dB over ${diffs.length} harmonics`);
    expect(diffs.length).toBeGreaterThanOrEqual(2);
    for (const d of diffs) expect(Math.abs(d), 'harmonic level against the base function, dB').toBeLessThan(1.5);
  });

  it('the base function names follow the engine indices (the old list named 2 Saw, 3 Square, 4 Noise)', () => {
    expect(ZYN_BASE_FUNCTIONS[2]).toBe('Pulse');
    expect(ZYN_BASE_FUNCTIONS[3]).toBe('Saw');
    expect(zynBaseFunction(2, 0.1)).toBe(-1);
    expect(zynBaseFunction(2, 0.9)).toBe(1);
    expect(zynBaseFunction(3, 0.5)).toBeCloseTo(1, 6);
  });
});

describe('ZynAddSubFX voice report through the real worklet', () => {
  it('posts 8-float records for the sounding note', async () => {
    const rig = await rigWith({ [P.AMP_SUSTAIN]: 0.5 });
    const { reports } = await rig.render(1.0, noteAt(rig, 64));
    const v = reports.at(-1)!.voices[0];
    expect(v.note).toBe(64);
    expect(v.stage).toBe('sustain');
    expect(v.cutoff).toBeGreaterThan(20);
    expect(v.extra).toHaveLength(0);
  });
});
