/**
 * Oidos curves against the real engine (worklet + WASM in Node): the partial set the voice init draws from the random
 * table, their decay and the filter window, the envelope, and the voice report.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from '@/engine/__tests__/workletHarness';
import { makeCustomRig, SAMPLE_RATE, bandPowersDb, relErr, type Rig } from './wasmRig';
import { DEFAULT_OIDOS_CONFIG, type OidosConfig } from '@typedefs/oidosInstrument';
import { OidosParam } from '@/engine/oidos/OidosSynth';
import { oidosParams, oidosPartials, oidosLevel, oidosEnvelope, oidosRandomData, oidosPartialGain } from '../oidosCurves';

const INDEX: Partial<Record<keyof OidosConfig, number>> = {
  seed: OidosParam.SEED, modes: OidosParam.MODES, fat: OidosParam.FAT, width: OidosParam.WIDTH, overtones: OidosParam.OVERTONES,
  sharpness: OidosParam.SHARPNESS, harmonicity: OidosParam.HARMONICITY, decayLow: OidosParam.DECAY_LOW, decayHigh: OidosParam.DECAY_HIGH,
  filterLow: OidosParam.FILTER_LOW, filterSlopeLow: OidosParam.FILTER_SLOPE_LOW, filterSweepLow: OidosParam.FILTER_SWEEP_LOW,
  filterHigh: OidosParam.FILTER_HIGH, filterSlopeHigh: OidosParam.FILTER_SLOPE_HIGH, filterSweepHigh: OidosParam.FILTER_SWEEP_HIGH,
  gain: OidosParam.GAIN, attack: OidosParam.ATTACK, release: OidosParam.RELEASE,
};
async function oidosRig(config: Partial<OidosConfig>): Promise<Rig> {
  const bytes = readFileSync(resolve(ROOT, 'public/oidos/Oidos.wasm'));
  const wasmBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const rig = await makeCustomRig(
    'public/oidos/Oidos.worklet.js',
    (deliver) => deliver({ type: 'init', data: { wasmBytes } }),
    (posted) => posted.some((p) => p.type === 'ready'),
  );
  const full = { ...DEFAULT_OIDOS_CONFIG, ...config };
  const params: Record<number, number> = {};
  for (const [key, index] of Object.entries(INDEX)) params[index!] = full[key as keyof OidosConfig] as number;
  await rig.send({ type: 'setParameters', data: { params } });
  await rig.send({ type: 'watchVoices', on: true });
  return rig;
}
const getter = (c: Partial<OidosConfig>) => (k: string): number => ({ ...DEFAULT_OIDOS_CONFIG, ...c } as unknown as Record<string, number>)[k];
const levelAt = (points: ReadonlyArray<readonly [number, number]>, t: number): number => {
  for (let i = 1; i < points.length; i++) if (points[i][0] >= t) { const [x0, y0] = points[i - 1], [x1, y1] = points[i]; return x1 === x0 ? y1 : y0 + ((y1 - y0) * (t - x0)) / (x1 - x0); }
  return points[points.length - 1][1];
};

describe('Oidos voice model', () => {
  it('replays the random table the engine generates', () => {
    const data = oidosRandomData();
    expect(data).toHaveLength(64 * 64 * 64);
    expect(data[0]).toBe(data[0] >>> 0);
  });

  it('the partial frequencies the model predicts are the spectral lines of the rendered note', async () => {
    const cfg: Partial<OidosConfig> = { modes: 0.06, fat: 0.01, width: 0, overtones: 0.3, harmonicity: 1, sharpness: 1, decayLow: 1, decayHigh: 1, gain: 0.25, attack: 0, release: 0.2, filterLow: 0, filterHigh: 1 };
    const rig = await oidosRig(cfg);
    const tone = 57;
    await rig.send({ type: 'noteOn', data: { note: tone, velocity: 100 } });
    const { audio } = await rig.render(0.6);
    const p = oidosParams(getter(cfg));
    const partials = oidosPartials(p, tone).sort((a, b) => b.amplitude - a.amplitude);
    expect(partials.length).toBe(6);
    const seg = audio.subarray(Math.floor(SAMPLE_RATE * 0.1), Math.floor(SAMPLE_RATE * 0.5));
    // each predicted line carries more power than the band half a semitone above it
    const lines = partials.slice(0, 4);
    const onLine = bandPowersDb(seg, lines.map((q) => q.hz), 1.003, 8192);
    const offLine = bandPowersDb(seg, lines.map((q) => q.hz * 1.03), 1.003, 8192);
    lines.forEach((q, i) => expect(onLine[i] - offLine[i], `partial at ${q.hz.toFixed(1)} Hz`).toBeGreaterThan(12));
  });

  it('the level over time follows the modes decay and the filter sweep (RMS in 100 ms windows, dB)', async () => {
    const cfg: Partial<OidosConfig> = { modes: 0.3, fat: 0.12, width: 0.5, overtones: 0.4, harmonicity: 0.5, sharpness: 0.8, decayLow: 0.6, decayHigh: 0.9, gain: 0.25, attack: 0, release: 0.3, filterLow: 0.3, filterSlopeLow: 0.85, filterSweepLow: 0.62, filterHigh: 0.9, filterSlopeHigh: 0.85 };
    const rig = await oidosRig(cfg);
    const tone = 57;
    await rig.send({ type: 'noteOn', data: { note: tone, velocity: 100 } });
    const { audio } = await rig.render(1.2);
    const p = oidosParams(getter(cfg));
    const partials = oidosPartials(p, tone);
    const win = Math.floor(SAMPLE_RATE * 0.1);
    const rms = (at: number): number => { let s = 0; for (let i = at; i < at + win; i++) s += audio[i] * audio[i]; return Math.sqrt(s / win); };
    const times = [0, 0.1, 0.2, 0.35, 0.5, 0.7];
    const measured = times.map((t) => 20 * Math.log10(rms(Math.floor(t * SAMPLE_RATE))));
    const modelled = times.map((t) => 20 * Math.log10(oidosLevel(p, partials, t + 0.05)));
    const offset = measured[0] - modelled[0];
    const diffs = measured.map((m, i) => m - offset - modelled[i]);
    expect(Math.max(...diffs.map(Math.abs)), 'measured minus modelled level against the first window, dB').toBeLessThan(1.5);
    expect(oidosPartialGain(p, 0, 0)).toBeGreaterThanOrEqual(0);
  });
});

describe('Oidos envelope and voice report', () => {
  it('the attack is linear in attack^2 seconds and the release linear in `release` seconds (reported envelope)', async () => {
    const cfg: Partial<OidosConfig> = { attack: 0.6, release: 0.5, modes: 0.05, fat: 0.01 };
    const rig = await oidosRig(cfg);
    await rig.send({ type: 'noteOn', data: { note: 60, velocity: 100 } });
    let off = -1;
    const { reports } = await rig.render(1.9, async (t) => { if (off < 0 && t >= 0.9) { off = t; await rig.send({ type: 'noteOff', data: { note: 60 } }); } });
    const env = oidosEnvelope(0.6, 0.5);
    const errs: number[] = [];
    for (const r of reports) {
      const v = r.voices[0];
      if (!v || v.stage === 'off') continue;
      if (v.stage === 'attack') errs.push(Math.abs(levelAt(env.points, v.elapsedSeconds) - v.level));
      if (v.stage === 'release') errs.push(Math.abs(levelAt(env.points, env.releaseAt + (r.t - off)) - v.level));
    }
    expect(errs.length).toBeGreaterThan(20);
    expect(Math.max(...errs), 'envelope level, absolute error').toBeLessThan(0.03);
    expect(relErr(env.attackEnd, 0.36)).toBeLessThan(1e-9);
    // attack 0 is instant (rate 2)
    expect(oidosEnvelope(0, 0.5).points[0][1]).toBe(1);
  });

  it('a voice report appears while a note sounds and the voice is gone after the release', async () => {
    const rig = await oidosRig({ attack: 0, release: 0.05, modes: 0.05, fat: 0.01 });
    await rig.send({ type: 'noteOn', data: { note: 64, velocity: 100 } });
    let off = false;
    const { reports } = await rig.render(0.8, async (t) => { if (!off && t >= 0.3) { off = true; await rig.send({ type: 'noteOff', data: { note: 64 } }); } });
    expect(reports.some((r) => r.voices[0]?.note === 64 && r.voices[0].stage === 'sustain')).toBe(true);
    expect(reports.at(-1)!.voices).toHaveLength(0);
  });
});
