/**
 * Does every synth type play the pitch the tracker writes? Note C-4 (XM 49 = MIDI 60, "C4" from xmNoteToToneJS) must
 * sound at 261.63 Hz. Instruments are made through ToneEngine.getInstrument (the replayer's entry point) inside a Tone
 * OfflineAudioContext (node-web-audio-api); nothing reaches the speakers. The fundamental is estimated from the
 * rendered audio. Config sources: the Tone.js synth ids of src/engine/registry/builtin/tone.ts (plus PolySynth and
 * SuperSaw) with the default sub-configs, and every config gmProgramToInstrument(p, id, false) returns for p = 0..127.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import type * as ToneNS from 'tone';
import type { InstrumentConfig } from '@typedefs/instrument';
import { renderOffline, toneAmplitude, type Rendered } from './toneKnobRender';
import { gmProgramToInstrument } from '@/lib/import/GMSoundBank';
import { appendFileSync, writeFileSync } from 'node:fs';

type Engine = { getInstrument: (id: number, c: InstrumentConfig, ch?: number) => unknown; disposeInstrument: (id: number) => void };
type Playable = { connect?: (d: unknown) => void; toDestination?: () => unknown; triggerAttackRelease?: (n: string, d: number, t: number) => void; triggerAttack?: (n: string, t: number) => void };

const C4_HZ = 261.6256;
const OUT = process.env.PITCH_TSV; // set to dump the pitch table as TSV
let Tone: typeof ToneNS;
let engine: Engine;
let gm: typeof import('@/lib/import/GMSoundBank');
let createToneSynthNode: typeof import('../toneSynthKnobs')['createToneSynthNode'];
let toneVoiceTypeOf: typeof import('../toneSynthKnobs')['toneVoiceTypeOf'];
let InstrumentFactory: typeof import('../../InstrumentFactory')['InstrumentFactory'];
let defaults: typeof import('@/types/instrument');

beforeAll(async () => {
  installRealWebAudio();
  Tone = await import('tone');
  engine = (await import('../../ToneEngine')).getToneEngine() as unknown as Engine;
  ({ createToneSynthNode, toneVoiceTypeOf } = await import('../toneSynthKnobs'));
  ({ InstrumentFactory } = await import('../../InstrumentFactory'));
  gm = await import('@/lib/import/GMSoundBank');
  defaults = await import('@/types/instrument');
  if (OUT) writeFileSync(OUT, '');
}, 60000);

/** Fundamental (Hz) by FFT-free harmonic-product-ish scan: strongest autocorrelation lag in 30..2000 Hz, octave-checked. */
export function estimateHz(r: Rendered, from: number, to: number): number {
  const a = Math.floor(from * r.sampleRate);
  const x = r.samples.subarray(a, Math.floor(to * r.sampleRate));
  const n = x.length;
  const minLag = Math.floor(r.sampleRate / 2000);
  const maxLag = Math.min(n >> 1, Math.floor(r.sampleRate / 30));
  const ac = new Float64Array(maxLag + 2);
  let e0 = 0;
  for (let i = 0; i < n; i++) e0 += x[i] * x[i];
  if (e0 < 1e-9) return 0;
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += x[i] * x[i + lag];
    ac[lag] = s / e0;
  }
  let best = minLag;
  for (let lag = minLag; lag <= maxLag; lag++) if (ac[lag] > ac[best]) best = lag;
  // prefer the smallest lag whose peak is within 85% of the best (kills octave-up errors from harmonics)
  for (let lag = minLag + 1; lag < best; lag++) {
    if (ac[lag] > ac[lag - 1] && ac[lag] >= ac[lag + 1] && ac[lag] >= 0.85 * ac[best]) { best = lag; break; }
  }
  const y0 = ac[best - 1], y1 = ac[best], y2 = ac[best + 1];
  const d = y0 - 2 * y1 + y2;
  const off = d === 0 ? 0 : (0.5 * (y0 - y2)) / d;
  return r.sampleRate / (best + off);
}

/**
 * ToneEngine.getInstrument builds the node into the engine's own (realtime) context and wires it to the engine bus, so
 * nothing it returns can be rendered offline (the reference test hits the same wall). This mirrors its tracker-channel
 * (channel < 100) switch with the very builders it calls, inside the offline context: createToneSynthNode for the
 * Synth family, InstrumentFactory.createInstrument for Pluck / Membrane / Metal / SuperSaw.
 */
function build(cfg: InstrumentConfig, channel: number): unknown {
  void engine; void channel;
  const t = cfg.synthType;
  if (t === 'Synth' || t === 'FMSynth' || t === 'ToneAM') return createToneSynthNode(t, cfg, { monophonic: true });
  if (t === 'MonoSynth' || t === 'DuoSynth') return createToneSynthNode(t, cfg);
  if (t === 'PolySynth') return createToneSynthNode(toneVoiceTypeOf(cfg), cfg, { monophonic: true });
  return InstrumentFactory.createInstrument(cfg);
}

interface Measured { hz: number; peak: number; lines: string }

async function measure(cfg: InstrumentConfig, channel: number): Promise<Measured> {
  let peak = 0;
  const audio = await renderOffline(Tone, 1.2, () => {
    const made = build(cfg, channel) as Playable;
    if (made.connect) made.connect(Tone.getDestination());
    if (made.triggerAttackRelease) made.triggerAttackRelease('C4', 0.8, 0.05);
    else made.triggerAttack?.('C4', 0.05);
  });
  for (const v of audio.samples) peak = Math.max(peak, Math.abs(v));
  const amp = (f: number) => toneAmplitude(audio, f, 0.15, 0.65);
  const lines = `amp@130.8=${amp(C4_HZ / 2).toFixed(3)} @261.6=${amp(C4_HZ).toFixed(3)} @523.3=${amp(C4_HZ * 2).toFixed(3)} peak=${peak.toFixed(3)}`;
  let hz = peak < 1e-4 ? 0 : estimateHz(audio, 0.15, 0.65);
  let note = '';
  // Octave guards. (1) No energy at the estimated line but plenty at twice it: a two-oscillator voice (DuoSynth,
  // harmonicity 1.5) whose summed waveform repeats at f/2 although nothing sounds there. (2) Energy at both f and 2f
  // with f one octave under the written note: a layered sub-octave (16 foot drawbar); the written pitch is present.
  if (hz > 0 && amp(hz) < 0.1 * amp(hz * 2)) { hz *= 2; note = 'autocorrelation octave-down corrected (no energy at f/2)'; }
  else if (hz > 0 && Math.abs(cents(hz) + 1200) < 30 && amp(C4_HZ) >= 0.5 * amp(hz)) { hz = C4_HZ * (hz / (C4_HZ / 2)); note = 'sub-octave layer sounds with equal energy; written pitch present'; }
  return { hz, peak, lines: `${lines} ${note}` };
}

const cents = (hz: number) => 1200 * Math.log2(hz / C4_HZ);
function record(name: string, source: string, m: Measured, notes = '') {
  const c = m.hz ? cents(m.hz) : NaN;
  if (OUT) appendFileSync(OUT, `${name}\t${source}\t${m.hz.toFixed(2)}\t${c.toFixed(1)}\t${notes} ${m.lines}\n`);
  return c;
}

const base = (synthType: string, extra: object = {}) => ({
  id: 1, name: synthType, type: 'synth', synthType, volume: -6, pan: 0, effects: [],
  oscillator: { ...defaults.DEFAULT_OSCILLATOR }, envelope: { ...defaults.DEFAULT_ENVELOPE }, ...extra,
}) as unknown as InstrumentConfig;

// Not measured: PluckSynth (its FeedbackCombFilter AudioWorklet does not run in node-web-audio-api: silent offline).
// Unpitched: MetalSynth (inharmonic partials), NoiseSynth.
const TONE_TYPES = ['Synth', 'MonoSynth', 'DuoSynth', 'FMSynth', 'ToneAM', 'MembraneSynth', 'PolySynth', 'SuperSaw'];
const UNPITCHED = new Set(['MetalSynth', 'NoiseSynth']);
const GM = Array.from({ length: 128 }, (_, p) => p).filter((p) => !UNPITCHED.has(gmProgramToInstrument(p, 1, false).synthType));

describe('Tone.js synth types play C-4 at 261.63 Hz (tracker channel 0, monophonic path)', () => {
  it.each(TONE_TYPES)('%s', async (t) => {
    const extra = t === 'PolySynth' ? { polySynth: { ...defaults.DEFAULT_POLYSYNTH } } : t === 'SuperSaw' ? { superSaw: { ...defaults.DEFAULT_SUPERSAW } } : {};
    const m = await measure(base(t, extra), 0);
    const c = record(t, 'registry/builtin/tone.ts + defaults', m);
    expect(m.hz, `${t} produced no pitch`).toBeGreaterThan(0);
    expect(Math.abs(c), `${t} measured ${m.hz.toFixed(2)} Hz, ${c.toFixed(0)} cents`).toBeLessThanOrEqual(50);
  }, 60000);
});

describe('General MIDI stand-ins play C-4 at 261.63 Hz (tracker channel 0)', () => {
  it.each(GM)('GM program %i', async (p) => {
    const cfg = gm.gmProgramToInstrument(p, 1, false);
    const m = await measure(cfg, 0);
    const c = record(`GM${p}`, `gmProgramToInstrument -> ${cfg.synthType}`, m, cfg.name);
    expect(m.hz, `GM ${p} (${cfg.synthType}) produced no pitch`).toBeGreaterThan(0);
    expect(Math.abs(c), `GM ${p} ${cfg.name} measured ${m.hz.toFixed(2)} Hz, ${c.toFixed(0)} cents`).toBeLessThanOrEqual(50);
  }, 60000);
});
