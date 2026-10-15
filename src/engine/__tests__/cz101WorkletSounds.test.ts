/**
 * The CZ-101, driven end to end: CZ101Synth -> the real worklet -> the real WASM.
 *
 * History this guards (2026-10-15):
 *  - silent: the worklet hand-instantiated the minified Emscripten WASM and never loaded;
 *  - near-silent chip: a 7-bit volume index into a 9-bit table;
 *  - "never decays": only envelope stage 0 was ever written, and key-off was handed the
 *    note time instead of the note, so nothing released;
 *  - "all presets sound the same": the bank had no data path to the synth;
 *  - the SysEx import: a decoded user patch must reach the synth and sound.
 * The factory bank is one Init patch; every behaviour below is tested with patches built here.
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, startWorklet, stereoOutputs, type WorkletProc } from './workletHarness';
import { cz101Transform } from '../cz101/cz101Transform';
import { CZ101_PRESET_BANK, cz101PatchParameters } from '../cz101/cz101Presets';
import { encodeCzSysex, decodeCzSysexFile } from '../cz101/cz101Sysex';
import type { CZPatch } from '../cz101/cz101Types';
import { useCz101UserPatchStore } from '@stores/useCz101UserPatchStore';
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

/** Fast attack, a decay to a sustain stage (rate 0), then a release. */
const SUSTAINED: CZPatch = {
  name: 'Test Sustained',
  line1: {
    waveform1: 0,
    dcaEnvelope: [{ rate: 100, level: 99 }, { rate: 70, level: 60 }, { rate: 0, level: 60 }, { rate: 80, level: 0 }],
    dcwEnvelope: [{ rate: 100, level: 40 }, { rate: 0, level: 40 }, { rate: 80, level: 40 }],
  },
};
/** No sustain stage: a pluck that rings down on its own. */
const PLUCK: CZPatch = {
  name: 'Test Pluck',
  line1: {
    waveform1: 0,
    dcaEnvelope: [{ rate: 110, level: 99 }, { rate: 40, level: 0 }],
    dcwEnvelope: [{ rate: 110, level: 60 }, { rate: 40, level: 5 }],
  },
};

async function play(rig: Rig, patch: CZPatch, holdSeconds: number, releaseSeconds: number) {
  rig.synth.loadPatch(patch);
  rig.synth.triggerAttack(60, undefined, 0.8);
  await settle();
  const held = windows(rig.render(holdSeconds));
  rig.synth.triggerRelease(60);
  await settle();
  const released = windows(rig.render(releaseSeconds));
  return { held, released, peak: Math.max(...held) };
}

describe('CZ-101 worklet', () => {
  it('plays a note the synth triggers: the real worklet and WASM render audible output (Init)', async () => {
    const rig = await makeRig();
    expect(rms(rig.render(0.2))).toBeLessThan(0.0005); // silent before a note
    rig.synth.triggerAttack(60, undefined, 0.8);
    await settle();
    expect(rig.messages.filter((m) => m.type === 'writeReg').length).toBeGreaterThan(2);
    expect(rig.messages.some((m) => m.type === 'envelope')).toBe(true);
    expect(rms(rig.render(0.5))).toBeGreaterThan(0.001);
  });

  it('a held note decays to the sustain stage of its patch and stays there', async () => {
    const { held, peak } = await play(await makeRig(), SUSTAINED, 2, 1);
    const last = held.slice(-5);
    expect(peak).toBeGreaterThan(0.002);
    expect(last[4]).toBeLessThan(peak * 0.9);            // settled below the attack
    expect(last[4]).toBeGreaterThan(peak * 0.05);        // but holds the sustain level
    expect(Math.abs(last[4] - last[0]) / last[0]).toBeLessThan(0.05); // steady
  });

  it('a held note with no sustain stage dies away on its own', async () => {
    const { held, peak } = await play(await makeRig(), PLUCK, 4, 1);
    expect(held[39]).toBeLessThan(peak * 0.02);          // more than 34 dB down after 4 s
  });

  it('a released note falls below -60 dB of its peak within its release time', async () => {
    const { held, released, peak } = await play(await makeRig(), SUSTAINED, 1, 2);
    expect(held[9]).toBeGreaterThan(peak * 0.1);         // really sounding at key-off
    const silentAt = released.findIndex((v) => v < peak * 0.001);
    expect(silentAt, 'never fell below -60 dB').toBeGreaterThanOrEqual(0);
    expect(silentAt).toBeLessThanOrEqual(5);             // within 0.6 s
  });

  it('a note released the way the engine releases it (note and time, as the registry passes them) goes silent', async () => {
    const rig = await makeRig();
    rig.synth.loadPatch(SUSTAINED);
    rig.synth.triggerAttack('C4' as unknown as number, undefined, 0.8);
    await settle();
    expect(rms(rig.render(0.3))).toBeGreaterThan(0.002);
    rig.synth.triggerRelease('C4', 1234.5);
    await settle();
    rig.render(0.5);
    expect(rms(rig.render(0.2))).toBeLessThan(0.0005);
  });
});

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

function spectralPeaks(x: Float32Array): number[] {
  const n = 16384;
  const mag = new Float64Array(n / 2);
  for (let f = 0; f < 4; f++) {
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

describe('CZ-101 tuning', () => {
  it('plays MIDI notes at their equal-tempered pitch (A4 = 440 to 442 Hz), one octave per 12 notes', async () => {
    const rig = await makeRig();
    const plain: CZPatch = {
      name: 'Plain Sawtooth',
      line1: {
        waveform1: 0,
        dcaEnvelope: [{ rate: 100, level: 99 }, { rate: 0, level: 99 }],
        dcwEnvelope: [{ rate: 100, level: 10 }, { rate: 0, level: 10 }],
      },
    };
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
    // The computer keyboard sends note names: C4 must sound where every other synth in the app puts C4 (261.63 Hz)
    rig.synth.loadPatch(plain);
    rig.synth.triggerAttack('C4', undefined, 0.8);
    await settle();
    const keyboardC4 = peakFrequency(rig.render(1.3));
    expect(Math.abs(1200 * Math.log2(keyboardC4 / 261.63))).toBeLessThan(10);
    const cents = (hz: number, midi: number) => 1200 * Math.log2(hz / (441 * Math.pow(2, (midi - 69) / 12)));
    for (const midi of [48, 57, 60, 69]) expect(Math.abs(cents(measured[midi], midi)), `MIDI ${midi} measured ${measured[midi].toFixed(1)} Hz`).toBeLessThan(10);
    expect(Math.abs(1200 * Math.log2(measured[69] / measured[57]) - 1200)).toBeLessThan(10);
  });
});

describe('CZ-101 wrapper behaviour (patches built here)', () => {
  const base = (extra: Partial<CZPatch['line1']> = {}): CZPatch['line1'] => ({
    waveform1: 0,
    dcaEnvelope: [{ rate: 100, level: 99 }, { rate: 0, level: 99 }],
    dcwEnvelope: [{ rate: 100, level: 25 }, { rate: 0, level: 25 }],
    ...extra,
  });

  it('a pitch envelope bends the note: it starts far higher than it ends', async () => {
    const rig = await makeRig();
    rig.synth.loadPatch({ name: 'Drop', line1: base({ dcoEnvelope: [{ rate: 120, level: 14, coarse: true }, { rate: 70, level: 0 }] }) });
    rig.synth.triggerAttack(60, undefined, 0.8);
    await settle();
    const x = rig.render(0.5);
    const crossings = (from: number, to: number) => {
      let n = 0;
      for (let i = from + 1; i < to; i++) if (x[i - 1] < 0 !== x[i] < 0) n++;
      return (n / 2) / ((to - from) / SAMPLE_RATE);
    };
    expect(crossings(48, 1200)).toBeGreaterThan(crossings(9600, 14400) * 1.5);
  });

  it('a window function changes the timbre', async () => {
    const rig = await makeRig();
    const centroidWith = async (window: number) => {
      rig.synth.loadPatch({ name: 'W', line1: base({ window: window as 0 }) });
      rig.synth.triggerAttack(60, undefined, 0.8);
      await settle();
      const x = rig.render(0.5);
      rig.synth.releaseAll();
      await settle();
      rig.render(0.5);
      return spectralCentroid(x, 12000);
    };
    const plain = await centroidWith(0);
    const triangle = await centroidWith(2);
    expect(Math.abs(Math.log2(triangle / plain))).toBeGreaterThan(0.1);
  });

  it('ring modulation makes inharmonic partials; the same two lines without it stay harmonic', async () => {
    const rig = await makeRig();
    const peaksWith = async (ring: boolean) => {
      rig.synth.loadPatch({
        name: 'Ring',
        line1: base({ waveform1: 1 }),
        line2: base({ waveform1: 0, detune: 530 }),
        ringMod: ring,
        ringOnly: ring,
      });
      rig.synth.triggerAttack(60, undefined, 0.8);
      await settle();
      const x = rig.render(0.6);
      rig.synth.releaseAll();
      await settle();
      rig.render(0.5);
      return spectralPeaks(x);
    };
    const f0 = 441 * Math.pow(2, (60 - 69) / 12);
    const inharmonicity = (peaks: number[]) => peaks.map((p) => Math.abs(p / f0 - Math.round(p / f0))).reduce((a, b) => a + b, 0) / peaks.length;
    expect(inharmonicity(await peaksWith(true))).toBeGreaterThan(inharmonicity(await peaksWith(false)) + 0.05);
  });
});

/** Chip-side probe: the DCO (pitch envelope) offset of the most recently started single-line note's voice, in semitones. */
function dcoSemitones(rig: Rig): number {
  const wasm = (rig.proc as unknown as { wasm: { _upd933_env_level: (kind: number, voice: number) => number } }).wasm;
  return wasm._upd933_env_level(2, lastWrittenVoice(rig)) / 16; // fine units: 1/16 semitone
}
/** The voice the most recent (single-line) note was written to. */
function lastWrittenVoice(rig: Rig): number {
  const writes = rig.messages.filter((m) => m.type === 'writeReg') as unknown as { register: number }[];
  return writes.filter((w) => w.register >= 0x60 && w.register < 0x68).slice(-1)[0].register - 0x60;
}

describe('CZ-101 release and retrigger', () => {
  /** A bend of +2 semitones held while the key is down, with NO pitch step after the sustain point; slow amplitude release. */
  const BENT: CZPatch = {
    name: 'Test Held Bend',
    line1: {
      waveform1: 0,
      dcaEnvelope: [{ rate: 100, level: 99 }, { rate: 0, level: 99 }, { rate: 50, level: 0 }],
      dcwEnvelope: [{ rate: 100, level: 30 }, { rate: 0, level: 30 }],
      dcoEnvelope: [{ rate: 110, level: 1, coarse: true }, { rate: 0, level: 1, coarse: true }],
    },
  };

  it('a held pitch bend stays put when the key is released (no pitch "boing") until the sound is 40 dB down', async () => {
    const rig = await makeRig();
    rig.synth.loadPatch(BENT);
    rig.synth.triggerAttack(60, undefined, 0.8);
    await settle();
    rig.render(0.5);
    const base = dcoSemitones(rig);
    expect(base).toBeCloseTo(2, 1);
    const peak = rms(rig.render(0.05));
    rig.synth.triggerRelease(60);
    await settle();
    let checked = 0;
    for (let i = 0; i < 24; i++) {
      const level = rms(rig.render(0.05));
      if (level > peak * 0.01) {
        checked++;
        expect(Math.abs(dcoSemitones(rig) - base) * 100, `release window ${i}: pitch moved`).toBeLessThan(30);
      }
    }
    expect(checked).toBeGreaterThan(3); // the release really was audible for a while
  });

  /** Pitch and waveform steps after the sustain point that END away from zero: the next note must not inherit them. */
  const LEFTOVER: CZPatch = {
    name: 'Test Leftover',
    line1: {
      waveform1: 0,
      dcaEnvelope: [{ rate: 100, level: 99 }, { rate: 0, level: 99 }, { rate: 90, level: 0 }],
      dcwEnvelope: [{ rate: 100, level: 20 }, { rate: 0, level: 20 }, { rate: 100, level: 70 }],
      dcoEnvelope: [{ rate: 70, level: 2 }, { rate: 0, level: 2 }, { rate: 110, level: 40, coarse: true }],
    },
  };

  it('every note reproduces the first one, also when its voice comes back round after a release that left the envelopes elsewhere', async () => {
    const rig = await makeRig();
    rig.synth.loadPatch(LEFTOVER);
    const firstVoices: number[] = [];
    const notes: { pitch: number[]; level: number[]; voice: number }[] = [];
    for (let n = 0; n < 6; n++) { // 4 voice pairs: note 5 returns to the voice note 1 used
      rig.synth.triggerAttack(60, undefined, 0.8);
      await settle();
      const voice = lastWrittenVoice(rig);
      firstVoices.push(voice);
      const pitch: number[] = [];
      const level: number[] = [];
      for (let i = 0; i < 6; i++) { level.push(rms(rig.render(0.05))); pitch.push(dcoSemitones(rig)); }
      rig.synth.triggerRelease(60);
      await settle();
      rig.render(0.6); // let the release finish
      notes.push({ pitch, level, voice });
    }
    expect(new Set(firstVoices).size, 'a voice came back round').toBeLessThan(6);
    const [first, ...later] = notes;
    for (const [i, note] of later.entries()) {
      note.pitch.forEach((p, k) => expect(Math.abs(p - first.pitch[k]), `note ${i + 2} pitch at ${k * 50} ms`).toBeLessThan(0.1));
      note.level.forEach((l, k) => expect(Math.abs(20 * Math.log10((l + 1e-6) / (first.level[k] + 1e-6))), `note ${i + 2} level at ${k * 50} ms`).toBeLessThan(1.5));
    }
  });

  it('a key pressed again while the last one is still releasing gets a free voice instead of cutting the release', async () => {
    const rig = await makeRig();
    rig.synth.loadPatch(BENT);
    rig.synth.triggerAttack(60, undefined, 0.8);
    await settle();
    const first = lastWrittenVoice(rig);
    rig.render(0.3);
    rig.synth.triggerRelease(60);
    await settle();
    rig.render(0.05); // still ringing out
    const keyOffs = rig.messages.filter((m) => m.type === 'keyOff').length;
    rig.synth.triggerAttack(60, undefined, 0.8);
    await settle();
    expect(lastWrittenVoice(rig)).not.toBe(first);
    expect(rig.messages.filter((m) => m.type === 'keyOff').length).toBe(keyOffs); // nothing was stolen
    expect(rms(rig.render(0.3))).toBeGreaterThan(0.002);
  });
});

describe('CZ-101 editor wiring', () => {
  it('choosing a preset through the editor path reaches the synth; a knob move changes the sound', async () => {
    const rig = await makeRig();
    const ctx = {
      instruments: new Map([[7, rig.synth]]),
      getInstrumentKey: (id: number) => id,
    } as unknown as SynthUpdateContext;

    rig.synth.loadPatch(SUSTAINED); // some other sound is loaded...
    loadMAMEChipPreset(ctx, 7, 0); // ...the editor's preset button: engine.loadMAMEChipPreset(id, program)
    expect(rig.synth.getProgram()).toBe(0);
    rig.synth.triggerAttack(60, undefined, 0.8);
    await settle();
    const init = rig.render(1);
    expect(rms(init, 0, 4800)).toBeGreaterThan(0.001);
    expect(rms(init, 43200)).toBeGreaterThan(rms(init, 0, 4800) * 0.5); // Init holds its level

    // a knob move on the sounding note: waveform (live), measured as a spectral change
    const before = spectralCentroid(init, 24000);
    updateMAMEChipParam(ctx, 7, 'waveform1', 6);
    updateMAMEChipParam(ctx, 7, 'waveform2', 6);
    await settle();
    const after = spectralCentroid(rig.render(1), 24000);
    expect(Math.abs(Math.log2(after / before))).toBeGreaterThan(0.1);
  });

  it('a window knob and an envelope-offset knob change the next note; the patch parameters mirror the patch', async () => {
    const rig = await makeRig();
    const noteWith = async (knobs: Record<string, number>) => {
      rig.synth.loadPreset(0);
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
    expect(Math.abs(Math.log2(spectralCentroid(windowed, 12000) / spectralCentroid(plain, 12000)))).toBeGreaterThan(0.05);
    expect(Math.abs(Math.log2(spectralCentroid(deep, 12000) / spectralCentroid(plain, 12000)))).toBeGreaterThan(0.05);
    expect(cz101PatchParameters(CZ101_PRESET_BANK[0].patch).waveform1).toBe(0);
  });

  it('the factory list is the Init patch only, and creating an instrument from it loads it (sentinel)', async () => {
    const rig = await makeRig();
    const factory = MAME_PRESETS.filter((p) => p.synthType === 'CZ101');
    expect(factory.map((p) => p.name)).toEqual(['CZ Init']);
    expect(CZ101_PRESET_BANK.map((e) => e.patch.name)).toEqual(['Init']);
    expect(getChipSynthDef('CZ101')!.presetNames).toEqual(['Init']);
    rig.synth.loadPatch(SUSTAINED);
    applyChipParameters(rig.synth, factory[0] as InstrumentConfig);
    expect(rig.synth.getProgram()).toBe(0);
    rig.synth.triggerAttack(60, undefined, 0.8);
    await settle();
    const held = windows(rig.render(1));
    expect(held[9]).toBeGreaterThan(held[0] * 0.5); // the Init patch holds; SUSTAINED would have decayed to 60 %
  });
});

describe('CZ-101 SysEx import reaches the sound', () => {
  it('a user patch decoded from a .syx file renders audio through the instrument config path (sentinel: its envelope reaches the worklet)', async () => {
    const rig = await makeRig();
    // A tone dump our encoder wrote from a patch with its own envelope rate, as a user's file would be named
    const source: CZPatch = { ...SUSTAINED, name: 'ignored' };
    const file = encodeCzSysex(source);
    const { patches, errors } = decodeCzSysexFile(file, 'My Imported Sound.syx');
    expect(errors).toEqual([]);
    expect(patches[0].patch.name).toBe('My Imported Sound');
    const [id] = useCz101UserPatchStore.getState().addPatches([patches[0].patch]);

    const config = { synthType: 'CZ101', parameters: { _program: 0, _userPatch: id, ...cz101PatchParameters(patches[0].patch), volume: 0.8 } };
    applyChipParameters(rig.synth, config as unknown as InstrumentConfig);
    rig.synth.triggerAttack(60, undefined, 0.8);
    await settle();
    expect(rms(rig.render(0.5))).toBeGreaterThan(0.0005);
    const dca = rig.messages.find((m) => m.type === 'envelope' && (m as { kind?: number }).kind === 0) as unknown as { stages: { rate: number }[] };
    expect(dca.stages.map((s) => s.rate)).toEqual(SUSTAINED.line1.dcaEnvelope.map((s) => s.rate)); // the imported patch's rates, not Init's
    useCz101UserPatchStore.getState().removePatch(id);
  });
});
