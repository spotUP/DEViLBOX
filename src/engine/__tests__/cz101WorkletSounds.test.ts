/**
 * The CZ-101, driven end to end: CZ101Synth -> the real worklet -> the real WASM.
 *
 * History this guards (2026-10-15):
 *  - silent: the worklet hand-instantiated the minified Emscripten WASM and never loaded;
 *  - near-silent chip: a 7-bit volume index into a 9-bit table;
 *  - "never decays": only envelope stage 0 was ever written, and key-off was handed the
 *    note time instead of the note, so nothing released;
 *  - "all presets sound the same": the bank had no data path to the synth.
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, startWorklet, stereoOutputs, type WorkletProc } from './workletHarness';
import { cz101Transform } from '../cz101/cz101Transform';
import { CZ101_PRESET_BANK, cz101PresetParameters } from '../cz101/cz101Presets';
import { getChipSynthDef } from '@constants/chipParameters';
import { MAME_PRESETS } from '@constants/factoryPresets/mame';
import { applyChipParameters } from '../registry/sdk/mame';
import { loadMAMEChipPreset, updateMAMEChipParam, type SynthUpdateContext } from '../tone/SynthParameterUpdates';
import type { InstrumentConfig } from '@typedefs/instrument';

const fakeCtx = {
  audioWorklet: { addModule: async () => {} },
  createGain: () => ({ gain: { value: 1 }, connect: () => {} }),
  destination: {},
};
vi.mock('@utils/audio-context', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getDevilboxAudioContext: () => fakeCtx,
}));

const SAMPLE_RATE = 48000;
const BLOCK = 128;
const origFetch = globalThis.fetch;
const origNode = (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode;

interface Rig {
  proc: WorkletProc;
  synth: import('../cz101/CZ101Synth').CZ101Synth;
  messages: { type: string }[];
  /** Render `seconds`; returns the mono samples */
  render: (seconds: number) => Float32Array;
}

/** A fresh worklet + a CZ101Synth wired to it by the same messages the browser would carry. */
async function makeRig(): Promise<Rig> {
  const h = await startWorklet('cz101', 'CZ101', cz101Transform);
  const messages: { type: string }[] = [];
  const send = async (m: unknown) => {
    const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
    Object.defineProperty(process, 'versions', { value: {}, configurable: true });
    try { await h.send(m); } finally { Object.defineProperty(process, 'versions', versions); }
  };
  globalThis.fetch = (async (url: string) => {
    const buf = readFileSync(resolve(ROOT, 'public', String(url).replace(/^\//, '')));
    return {
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      text: async () => buf.toString('utf8'),
    };
  }) as unknown as typeof fetch;
  (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = class {
    private listeners: ((e: MessageEvent) => void)[] = [];
    port = {
      addEventListener: (_: string, l: (e: MessageEvent) => void) => { this.listeners.push(l); },
      removeEventListener: () => {},
      start: () => {},
      postMessage: (m: { type: string }) => {
        messages.push(m);
        // Messages reach the processor in order, as on a real port
        void send(m).then(() => {
          for (const p of h.posted.splice(0)) this.listeners.forEach((l) => l({ data: p } as MessageEvent));
        });
      },
    };
    connect() {}
    disconnect() {}
  };
  const { CZ101Synth } = await import('../cz101/CZ101Synth');
  const synth = new CZ101Synth();
  await synth.init();
  const render = (seconds: number): Float32Array => {
    const blocks = Math.round((seconds * SAMPLE_RATE) / BLOCK);
    const out = new Float32Array(blocks * BLOCK);
    for (let b = 0; b < blocks; b++) {
      const o = stereoOutputs(1);
      h.proc.process([], o);
      out.set(o[0][0], b * BLOCK);
    }
    return out;
  };
  return { proc: h.proc, synth, messages, render };
}

afterAll(() => {
  globalThis.fetch = origFetch;
  (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = origNode;
});

const settle = () => new Promise((r) => setTimeout(r, 15)); // port messages are async hops

const rms = (x: Float32Array, from = 0, to = x.length) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / Math.max(1, to - from));
};
/** RMS of each 100 ms window */
const windows = (x: Float32Array) => {
  const size = SAMPLE_RATE / 10;
  return Array.from({ length: Math.floor(x.length / size) }, (_, i) => rms(x, i * size, (i + 1) * size));
};

function byName(name: string): number {
  const index = CZ101_PRESET_BANK.findIndex((entry) => entry.patch.name === name);
  if (index < 0) throw new Error(`no preset ${name}`);
  return index;
}
async function play(rig: Rig, preset: string, holdSeconds: number, releaseSeconds: number) {
  rig.synth.loadPreset(byName(preset));
  rig.synth.triggerAttack(60, undefined, 0.8);
  await settle();
  const held = windows(rig.render(holdSeconds));
  rig.synth.triggerRelease(60);
  await settle();
  const released = windows(rig.render(releaseSeconds));
  return { held, released, peak: Math.max(...held) };
}

describe('CZ-101 worklet', () => {
  it('plays a note the synth triggers: the real worklet and WASM render audible output', async () => {
    const rig = await makeRig();
    expect(rms(rig.render(0.2))).toBeLessThan(0.0005); // silent before a note
    rig.synth.triggerAttack(60, undefined, 0.8);
    await settle();
    expect(rig.messages.filter((m) => m.type === 'writeReg').length).toBeGreaterThan(2);
    expect(rig.messages.some((m) => m.type === 'envelope')).toBe(true);
    expect(rms(rig.render(0.5))).toBeGreaterThan(0.001);
  });

  it('a held note decays to the sustain stage of its patch and stays there (Brass Section)', async () => {
    const { held, peak } = await play(await makeRig(), 'Brass Section', 2, 1);
    const last = held.slice(-5);
    expect(peak).toBeGreaterThan(0.002);
    expect(last[4]).toBeLessThan(peak * 0.9);            // settled below the attack swell
    expect(last[4]).toBeGreaterThan(peak * 0.05);        // but holds the sustain level
    expect(Math.abs(last[4] - last[0]) / last[0]).toBeLessThan(0.05); // steady
  });

  it('a held note with no sustain stage dies away on its own (Electric Piano)', async () => {
    const { held, peak } = await play(await makeRig(), 'Electric Piano', 4, 1);
    expect(held[39]).toBeLessThan(peak * 0.02);          // more than 34 dB down after 4 s
  });

  it('a released note falls below -60 dB of its peak within its release time (Synthesizer Bass)', async () => {
    // release stage 0.12 s from the sustain level
    const { held, released, peak } = await play(await makeRig(), 'Synthesizer Bass', 1, 2);
    expect(held[9]).toBeGreaterThan(peak * 0.2);         // really sounding at key-off
    const silentAt = released.findIndex((v) => v < peak * 0.001);
    expect(silentAt, 'never fell below -60 dB').toBeGreaterThanOrEqual(0);
    expect(silentAt).toBeLessThanOrEqual(5);             // within 0.6 s
  });

  it('a note released the way the engine releases it (note and time, as the registry passes them) goes silent', async () => {
    const rig = await makeRig();
    rig.synth.loadPreset(byName('Pipe Organ'));
    rig.synth.triggerAttack('C4' as unknown as number, undefined, 0.8);
    await settle();
    expect(rms(rig.render(0.3))).toBeGreaterThan(0.002);
    rig.synth.triggerRelease('C4', 1234.5);
    await settle();
    rig.render(0.5);
    expect(rms(rig.render(0.2))).toBeLessThan(0.0005);
  });
});

describe('CZ-101 presets', () => {
  it('the bank is large and spans every category', () => {
    expect(CZ101_PRESET_BANK.length).toBeGreaterThanOrEqual(48);
    const categories = new Set(CZ101_PRESET_BANK.map((entry) => entry.category));
    expect(categories.size).toBe(11);
    const names = CZ101_PRESET_BANK.map((entry) => entry.patch.name);
    expect(new Set(names).size).toBe(names.length);
    const waveforms = new Set(CZ101_PRESET_BANK.flatMap((e) => [e.patch.line1.waveform1, e.patch.line1.waveform2 ?? -1]));
    for (const w of [0, 1, 2, 4, 5, 6, 7]) expect(waveforms.has(w as never), `waveform ${w}`).toBe(true);
    const windowsUsed = new Set(CZ101_PRESET_BANK.map((e) => e.patch.line1.window ?? 0));
    expect(windowsUsed.size).toBeGreaterThanOrEqual(5);
  });

  it('the instrument list, the editor and the factory list all come from the bank', () => {
    const def = getChipSynthDef('CZ101')!;
    expect(def.presetCount).toBe(CZ101_PRESET_BANK.length);
    expect(def.presetNames).toEqual(CZ101_PRESET_BANK.map((e) => e.patch.name));
    const factory = MAME_PRESETS.filter((p) => p.synthType === 'CZ101');
    expect(factory.map((p) => p.name)).toEqual(CZ101_PRESET_BANK.map((e) => `CZ ${e.patch.name}`));
    expect(factory.every((p, i) => p.parameters?._program === i)).toBe(true);
  });

  // 57 notes of 2 s each through the real worklet: render once, check audibility and distinctness together
  const features: { name: string; env: number[]; peakDb: number; c1: number; c2: number }[] = [];
  it('every preset renders audio within the first second', async () => {
    for (let i = 0; i < CZ101_PRESET_BANK.length; i++) {
      const name = CZ101_PRESET_BANK[i].patch.name!;
      const rig = await makeRig();
      rig.synth.loadPreset(i);
      rig.synth.triggerAttack(60, undefined, 0.8);
      await settle();
      const signal = rig.render(2);
      expect(rms(signal, 0, SAMPLE_RATE), `${name} is silent in its first second`).toBeGreaterThan(0.0005);
      const w = windows(signal);
      const peak = Math.max(...w);
      features.push({
        name,
        env: w.map((v) => Math.max(-80, 20 * Math.log10(v / peak + 1e-9))),
        peakDb: 20 * Math.log10(peak),
        c1: spectralCentroid(signal, Math.round(0.1 * SAMPLE_RATE)),
        c2: spectralCentroid(signal, Math.round(1.0 * SAMPLE_RATE)),
      });
    }
  }, 120000);

  it('no two presets sound alike (envelope shape and spectral centroid at 0.1 s and 1 s)', () => {
    expect(features.length).toBe(CZ101_PRESET_BANK.length);
    let min = { d: Infinity, a: '', b: '' };
    const all: { d: number; a: string; b: string }[] = [];
    for (let i = 0; i < features.length; i++) {
      for (let j = i + 1; j < features.length; j++) {
        const d = featureDistance(features[i], features[j]);
        all.push({ d, a: features[i].name, b: features[j].name });
        if (d < min.d) min = { d, a: features[i].name, b: features[j].name };
      }
    }
    if (process.env.CZ_DUMP) console.log('CZPAIRS ' + all.sort((x, y) => x.d - y.d).slice(0, 25).map((p) => `${p.a}/${p.b}=${p.d.toFixed(2)}`).join(' | ') + '\nCZFEAT ' + features.map((f) => `${f.name}:${f.peakDb.toFixed(0)}dB,${f.c1.toFixed(0)},${f.c2.toFixed(0)}`).join(' | '));
    console.log(`[CZ101] closest preset pair: ${min.a} / ${min.b} distance ${min.d.toFixed(3)}`);
    expect(min.d, `${min.a} and ${min.b} are near-identical`).toBeGreaterThan(MIN_DISTANCE);
  });
});

const MIN_DISTANCE = 0.3;

/** Magnitude-weighted mean frequency of a 4096-sample Hann-windowed frame starting at `start`. */
function spectralCentroid(x: Float32Array, start: number, power = false, n = 4096, minHz = 0): number {
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = (x[start + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  fft(re, im);
  let num = 0;
  let den = 0;
  for (let k = Math.max(1, Math.round((minHz * n) / SAMPLE_RATE)); k < n / 2; k++) {
    const mag = power ? re[k] * re[k] + im[k] * im[k] : Math.hypot(re[k], im[k]);
    num += mag * ((k * SAMPLE_RATE) / n);
    den += mag;
  }
  return den > 0 ? num / den : 0;
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
      }
    }
  }
}

/**
 * Distance between two presets: mean envelope difference in 6 dB units, plus the
 * octave distance of the centroids at 0.1 s and 1 s (a silent centroid counts as the
 * same octave), plus a small share of the loudness difference.
 */
function featureDistance(a: { env: number[]; peakDb: number; c1: number; c2: number }, b: typeof a): number {
  let env = 0;
  for (let i = 0; i < a.env.length; i++) env += Math.abs(a.env[i] - b.env[i]);
  env /= a.env.length * 6;
  const oct = (x: number, y: number) => (x > 0 && y > 0 ? Math.abs(Math.log2(x / y)) : 0);
  return env + oct(a.c1, b.c1) + oct(a.c2, b.c2) + Math.abs(a.peakDb - b.peakDb) / 24;
}

/** Presets that are struck or plucked: they must ring down and go from a bright strike to a dull ring. */
const STRUCK_CATEGORIES = ['Bells and Mallets', 'Pluck', 'Percussion and Effects', 'Ring Modulation'];
const NOT_STRUCK = ['Wind Noise', 'Alien Ring', 'Robot Voice']; // continuous by design

interface StruckMetrics {
  name: string;
  rms: [number, number, number];
  centroid20ms: number;
  centroid500ms: number;
  level500ms: number;
  decayTo40dB: number;
  peaks: number[];
  f0: number;
}

/** Hz of the first four spectral peaks (100 Hz to 9 kHz) of the 30-500 ms span, strongest four ordered by frequency. */
function spectralPeaks(x: Float32Array): number[] {
  const n = 16384;
  const mag = new Float64Array(n / 2);
  const frames = 4;
  for (let f = 0; f < frames; f++) {
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    const start = Math.round(0.03 * SAMPLE_RATE) + f * 2048;
    for (let i = 0; i < n; i++) re[i] = (x[start + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
    fft(re, im);
    for (let k = 0; k < n / 2; k++) mag[k] += Math.hypot(re[k], im[k]);
  }
  const lo = Math.round((100 * n) / SAMPLE_RATE);
  const hi = Math.round((9000 * n) / SAMPLE_RATE);
  const found: { k: number; m: number }[] = [];
  for (let k = lo + 1; k < hi; k++) if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1]) found.push({ k, m: mag[k] });
  found.sort((a, b) => b.m - a.m);
  return found.slice(0, 4).map((p) => (p.k * SAMPLE_RATE) / n).sort((a, b) => a - b);
}

async function measureStruck(index: number): Promise<StruckMetrics> {
  const entry = CZ101_PRESET_BANK[index];
  const rig = await makeRig();
  rig.synth.loadPreset(index);
  rig.synth.triggerAttack(60, undefined, 0.8);
  await settle();
  const x = rig.render(6);
  const span = (a: number, b: number) => rms(x, Math.round(a * SAMPLE_RATE), Math.round(b * SAMPLE_RATE));
  const win = Math.round(0.01 * SAMPLE_RATE);
  const levels = Array.from({ length: Math.floor(x.length / win) }, (_, i) => rms(x, i * win, (i + 1) * win));
  const peak = Math.max(...levels);
  const peakAt = levels.indexOf(peak);
  let last = peakAt; // last window still above -40 dB
  levels.forEach((v, i) => { if (i > peakAt && v > peak * 0.01) last = i; });
  const centroidAt = (t: number) => spectralCentroid(x, Math.max(0, Math.round(t * SAMPLE_RATE) - 1024), true, 2048);
  return {
    name: entry.patch.name!,
    rms: [span(0, 0.05), span(0.05, 0.3), span(0.3, 1.5)],
    centroid20ms: centroidAt(0.02),
    centroid500ms: centroidAt(0.5),
    level500ms: span(0.45, 0.55),
    decayTo40dB: (last + 1) * 0.01,
    peaks: spectralPeaks(x),
    f0: 442 * Math.pow(2, (60 + 12 * (entry.patch.octave ?? 0) - 69) / 12),
  };
}

describe('CZ-101 struck and plucked presets', () => {
  const struck = CZ101_PRESET_BANK
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => STRUCK_CATEGORIES.includes(entry.category) && !NOT_STRUCK.includes(entry.patch.name!));
  const metrics: StruckMetrics[] = [];

  it('measures them', async () => {
    for (const { index } of struck) metrics.push(await measureStruck(index));
    if (process.env.CZ_DUMP2) {
      console.log('CZSTRUCK\n' + metrics.map((m) =>
        `${m.name.padEnd(22)} rms ${m.rms.map((v) => (20 * Math.log10(v + 1e-9)).toFixed(0)).join('/')} dB  centroid ${m.centroid20ms.toFixed(0)} -> ${m.centroid500ms.toFixed(0)}  -40dB at ${m.decayTo40dB.toFixed(2)}s  f0 ${m.f0.toFixed(0)} peaks ${m.peaks.map((p) => p.toFixed(0)).join(',')} ratios ${m.peaks.map((p) => (p / m.f0).toFixed(2)).join(',')}`).join('\n'));
    }
  }, 120000);

  it('none of them has a sustain stage, and each rings down below -40 dB', () => {
    for (const { entry } of struck) {
      const name = entry.patch.name!;
      const held = entry.patch.line1.dcaEnvelope.some((stage, i) => i > 0 && stage.rate === 0);
      expect(held, `${name} has a sustain stage`).toBe(false);
    }
    for (const m of metrics) {
      const limit = m.name === 'Steel Drum' ? 1.2 : 5.5;
      expect(m.decayTo40dB, `${m.name} is still ringing at ${m.decayTo40dB}s`).toBeLessThanOrEqual(limit);
    }
  });

  it('each goes from a bright strike to a duller ring (centroid at 20 ms at least 1.5x the one at 500 ms)', () => {
    const dull = metrics
      .filter((m) => m.level500ms > 0.03 * m.rms[0] && m.centroid500ms > 0) // already silent at 0.5 s (-30 dB or more below the strike): the ring is over
      .filter((m) => m.centroid20ms < 1.5 * m.centroid500ms)
      .map((m) => `${m.name} ${m.centroid20ms.toFixed(0)} -> ${m.centroid500ms.toFixed(0)} Hz`);
    expect(dull).toEqual([]);
  });

  it('the Steel Drum is inharmonic: its strongest partials are not whole multiples of the fundamental', () => {
    const drum = metrics.find((m) => m.name === 'Steel Drum')!;
    const deviation = drum.peaks.map((p) => { const r = p / drum.f0; return Math.abs(r - Math.round(r)); });
    expect(deviation.reduce((a, b) => a + b, 0) / deviation.length).toBeGreaterThan(0.12);
  });
});

/** Fundamental in Hz at time t: the period between the rising zero crossings around it. */
function fundamentalAt(x: Float32Array, t: number): number {
  const crossings: number[] = [];
  for (let i = 1; i < x.length; i++) {
    if (x[i - 1] < 0 && x[i] >= 0) crossings.push((i - 1 + -x[i - 1] / (x[i] - x[i - 1])) / SAMPLE_RATE);
  }
  for (let k = 0; k + 1 < crossings.length; k++) {
    if (crossings[k + 1] > t) return crossings[k] <= t ? 1 / (crossings[k + 1] - crossings[k]) : 1 / (crossings[k + 1] - (crossings[k - 1] ?? crossings[k]));
  }
  return 0;
}

/** Geometric over arithmetic mean of the power spectrum, 200 Hz to 12 kHz, of the span starting at `from` seconds (1 = white noise). */
function spectralFlatness(x: Float32Array, from: number): number {
  const n = 4096;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const start = Math.round(from * SAMPLE_RATE);
  for (let i = 0; i < n; i++) re[i] = (x[start + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  fft(re, im);
  let logSum = 0;
  let sum = 0;
  let count = 0;
  for (let k = Math.round((200 * n) / SAMPLE_RATE); k < Math.round((12000 * n) / SAMPLE_RATE); k++) {
    const power = re[k] * re[k] + im[k] * im[k] + 1e-12;
    logSum += Math.log(power);
    sum += power;
    count++;
  }
  return Math.exp(logSum / count) / (sum / count);
}

const DRUMS = ['Kick Drum', 'Tom', 'Snare Drum', 'Hi-Hat', 'Open Hi-Hat', 'Hand Clap'];

describe('CZ-101 drum presets', () => {
  const rows = new Map<string, {
    sweep: [number, number, number]; peakAtMs: number; decay: number;
    centroidEarly: number; centroidLate: number; flatness: number; rmsEarlyDb: number;
  }>();
  it('measures them', async () => {
    for (const name of DRUMS) {
      const rig = await makeRig();
      rig.synth.loadPreset(byName(name));
      rig.synth.triggerAttack(60, undefined, 0.8);
      await settle();
      const x = rig.render(1.5);
      const win = Math.round(0.001 * SAMPLE_RATE);
      const levels = Array.from({ length: Math.floor(x.length / win) }, (_, i) => rms(x, i * win, (i + 1) * win));
      const peak = Math.max(...levels);
      let last = levels.indexOf(peak);
      levels.forEach((v, i) => { if (v > peak * 0.01) last = i; });
      rows.set(name, {
        sweep: [fundamentalAt(x, 0.005), fundamentalAt(x, 0.03), fundamentalAt(x, 0.1)],
        peakAtMs: levels.indexOf(peak),
        decay: (last + 1) * 0.001,
        centroidEarly: spectralCentroid(x, 0, true, 1024, name.includes('Hat') || name === 'Snare Drum' || name === 'Hand Clap' ? 1000 : 0),
        centroidLate: spectralCentroid(x, Math.round(0.1 * SAMPLE_RATE), true, 4096, name.includes('Hat') || name === 'Snare Drum' || name === 'Hand Clap' ? 1000 : 0),
        flatness: spectralFlatness(x, 0.02),
        rmsEarlyDb: 20 * Math.log10(rms(x, 0, 960) + 1e-9),
      });
    }
    if (process.env.CZ_DUMP3) {
      console.log('CZDRUMS\n' + [...rows].map(([n, r]) =>
        `${n.padEnd(14)} sweep ${r.sweep.map((v) => v.toFixed(0)).join('/')} Hz  peak at ${r.peakAtMs} ms  -40dB at ${r.decay.toFixed(3)}s  centroid ${r.centroidEarly.toFixed(0)} -> ${r.centroidLate.toFixed(0)}  flatness ${r.flatness.toFixed(3)}`).join('\n'));
    }
  }, 60000);

  it('Kick Drum: low fundamental, fast pitch drop, instant peak, short decay, bright click then boom', () => {
    const r = rows.get('Kick Drum')!;
    expect(r.sweep[2]).toBeGreaterThanOrEqual(40);
    expect(r.sweep[2]).toBeLessThanOrEqual(70);
    expect(r.sweep[0]).toBeGreaterThanOrEqual(3 * r.sweep[2]);
    expect(r.peakAtMs).toBeLessThanOrEqual(5);
    expect(r.decay).toBeLessThanOrEqual(0.4);
    expect(r.centroidEarly).toBeGreaterThanOrEqual(2 * r.centroidLate);
  });
  it('Tom: pitched drop, instant peak, decays within 0.6 s', () => {
    const r = rows.get('Tom')!;
    expect(r.sweep[0]).toBeGreaterThanOrEqual(1.4 * r.sweep[2]);
    expect(r.peakAtMs).toBeLessThanOrEqual(5);
    expect(r.decay).toBeLessThanOrEqual(0.6);
  });
  it('Snare Drum: noisy, decays within 0.35 s', () => {
    const r = rows.get('Snare Drum')!;
    expect(r.decay).toBeLessThanOrEqual(0.35);
    expect(r.peakAtMs).toBeLessThanOrEqual(5);
    expect(r.flatness).toBeGreaterThanOrEqual(MIN_NOISE_FLATNESS);
  });
  it('Hi-Hat: bright noise; closed decays within 80 ms, open within 400 ms', () => {
    const closed = rows.get('Hi-Hat')!;
    const open = rows.get('Open Hi-Hat')!;
    expect(closed.centroidEarly).toBeGreaterThan(5000);
    expect(open.centroidEarly).toBeGreaterThan(5000);
    expect(closed.decay).toBeLessThanOrEqual(0.08);
    expect(open.decay).toBeLessThanOrEqual(0.4);
    expect(open.decay).toBeGreaterThan(closed.decay * 2);
    expect(closed.flatness).toBeGreaterThanOrEqual(MIN_NOISE_FLATNESS);
  });
  it('Hand Clap: noisy, a few bursts, decays within 0.4 s', () => {
    const r = rows.get('Hand Clap')!;
    expect(r.decay).toBeLessThanOrEqual(0.4);
    expect(r.flatness).toBeGreaterThanOrEqual(MIN_NOISE_FLATNESS);
  });
});

const MIN_NOISE_FLATNESS = 0.05;

/** Strongest spectral peak (Hz) of a 0.2-1.0 s span, refined by parabolic interpolation. */
function peakFrequency(x: Float32Array): number {
  const n = 32768;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const start = Math.round(0.2 * SAMPLE_RATE);
  for (let i = 0; i < n; i++) re[i] = (x[start + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  fft(re, im);
  let best = 1;
  const mag = (k: number) => Math.hypot(re[k], im[k]);
  for (let k = 2; k < n / 2 - 1; k++) if (mag(k) > mag(best)) best = k;
  const a = Math.log(mag(best - 1)), b = Math.log(mag(best)), c = Math.log(mag(best + 1));
  const shift = (0.5 * (a - c)) / (a - 2 * b + c);
  return ((best + shift) * SAMPLE_RATE) / n;
}

describe('CZ-101 tuning', () => {
  it('plays MIDI notes at their equal-tempered pitch (A4 = 440 to 442 Hz), one octave per 12 notes', async () => {
    const { CZ101Synth } = await import('../cz101/CZ101Synth');
    const rig = await makeRig();
    const plain = {
      name: 'Plain Sawtooth',
      line1: {
        waveform1: 0 as const,
        dcaEnvelope: [{ rate: 100, level: 99 }, { rate: 0, level: 99 }],
        dcwEnvelope: [{ rate: 100, level: 10 }, { rate: 0, level: 10 }],
      },
    };
    void CZ101Synth;
    const measured: Record<number, number> = {};
    for (const midi of [48, 57, 60, 69]) {
      rig.synth.loadPatch(plain);
      rig.synth.triggerAttack(midi, undefined, 0.8);
      await settle();
      measured[midi] = peakFrequency(rig.render(1.3));
      rig.synth.releaseAll();
      await settle();
      rig.render(0.5);
    }
    // The computer keyboard sends note names (octave + semitone, useNoteInput: `${note}${octave}`): C4 must sound
    // where every other synth in the app puts C4 (261.63 Hz, Tone.js)
    rig.synth.loadPatch(plain);
    rig.synth.triggerAttack('C4', undefined, 0.8);
    await settle();
    const keyboardC4 = peakFrequency(rig.render(1.3));
    if (process.env.CZ_DUMP4) console.log('CZTUNE ' + JSON.stringify(measured) + ' keyboard C4 ' + keyboardC4);
    expect(Math.abs(1200 * Math.log2(keyboardC4 / 261.63))).toBeLessThan(10);
    const cents = (hz: number, midi: number) => 1200 * Math.log2(hz / (441 * Math.pow(2, (midi - 69) / 12)));
    for (const midi of [48, 57, 60, 69]) expect(Math.abs(cents(measured[midi], midi)), `MIDI ${midi} measured ${measured[midi].toFixed(1)} Hz`).toBeLessThan(10);
    expect(Math.abs(1200 * Math.log2(measured[69] / measured[57]) - 1200)).toBeLessThan(10);
  });
});

describe('CZ-101 pitch envelope', () => {
  it('a pitch envelope bends the note: the Kick Drum starts far higher than it ends', async () => {
    const rig = await makeRig();
    rig.synth.loadPreset(byName('Kick Drum'));
    rig.synth.triggerAttack(60, undefined, 0.8);
    await settle();
    const x = rig.render(0.5);
    const crossings = (from: number, to: number) => {
      let n = 0;
      for (let i = from + 1; i < to; i++) if (x[i - 1] < 0 !== x[i] < 0) n++;
      return (n / 2) / ((to - from) / SAMPLE_RATE); // Hz
    };
    if (process.env.CZ_DUMP) console.log('CZKICK ' + [0,1,2,3,4,6,10].map((k) => crossings(k * 1200 + 1, k * 1200 + 1200).toFixed(0)).join(' ') + ' msgs ' + JSON.stringify(rig.messages.filter((m) => m.type === 'envelope' && (m as { kind?: number }).kind === 2)));
    const early = crossings(48, 1200);          // first 25 ms
    const late = crossings(9600, 14400);        // 200-300 ms
    expect(early).toBeGreaterThan(late * 2);
  });
});

describe('CZ-101 editor wiring', () => {
  it('choosing a preset through the editor path swaps the synth patch and its sound; a knob move changes the sound', async () => {
    const rig = await makeRig();
    const ctx = {
      instruments: new Map([[7, rig.synth]]),
      getInstrumentKey: (id: number) => id,
    } as unknown as SynthUpdateContext;

    // the editor's preset buttons: engine.loadMAMEChipPreset(id, program)
    loadMAMEChipPreset(ctx, 7, byName('Marimba'));
    expect(rig.synth.getProgram()).toBe(byName('Marimba'));
    rig.synth.triggerAttack(60, undefined, 0.8);
    await settle();
    const marimba = rig.render(1);
    rig.synth.releaseAll();
    await settle();
    rig.render(1);

    loadMAMEChipPreset(ctx, 7, byName('Pipe Organ'));
    expect(rig.synth.getProgram()).toBe(byName('Pipe Organ'));
    rig.synth.triggerAttack(60, undefined, 0.8);
    await settle();
    const organ = rig.render(1);
    expect(rms(marimba, 0, 4800)).toBeGreaterThan(0.001);
    // percussive vs sustained: the marimba is mostly gone by the end of the second
    expect(rms(marimba, 43200)).toBeLessThan(rms(marimba, 0, 4800) * 0.2);
    expect(rms(organ, 43200)).toBeGreaterThan(rms(organ, 0, 4800) * 0.5);

    // a knob move on the sounding note: waveform (live), measured as a spectral change
    const before = spectralCentroid(organ, 24000);
    updateMAMEChipParam(ctx, 7, 'waveform1', 6);
    updateMAMEChipParam(ctx, 7, 'waveform2', 6);
    await settle();
    const after = spectralCentroid(rig.render(1), 24000);
    expect(Math.abs(Math.log2(after / before))).toBeGreaterThan(0.1);
  });

  it('a window knob and an envelope-offset knob change the next note; the preset parameters mirror the bank', async () => {
    const rig = await makeRig();
    const noteWith = async (knobs: Record<string, number>) => {
      rig.synth.loadPreset(byName('Square Lead'));
      for (const [k, v] of Object.entries(knobs)) rig.synth.setParam(k, v);
      rig.synth.triggerAttack(60, undefined, 0.8);
      await settle();
      const x = rig.render(0.6);
      rig.synth.releaseAll();
      await settle();
      rig.render(0.8);
      return x;
    };
    const plain = await noteWith({});
    const windowed = await noteWith({ window: 2 });
    const deep = await noteWith({ dcw_depth: 20 });
    expect(spectralCentroid(windowed, 12000)).not.toBeCloseTo(spectralCentroid(plain, 12000), 0);
    expect(rms(deep, 12000, 24000)).not.toBeCloseTo(rms(plain, 12000, 24000), 3);

    const implied = cz101PresetParameters(byName('Square Lead'));
    expect(implied.waveform1).toBe(1);
    expect(implied._program).toBe(byName('Square Lead'));
  });

  it('creating an instrument from a factory preset loads that preset (sentinel)', async () => {
    const rig = await makeRig();
    const factory = MAME_PRESETS.find((p) => p.name === 'CZ Glass Bell')!;
    expect(rig.synth.getProgram()).toBe(0);
    applyChipParameters(rig.synth, factory as InstrumentConfig);
    expect(rig.synth.getProgram()).toBe(byName('Glass Bell'));
  });
});
