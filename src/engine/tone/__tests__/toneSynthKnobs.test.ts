/**
 * Every editor knob of the Tone core synths that used to do nothing now reaches the engine: through the engine's own
 * creation switch (ToneEngine.getInstrument), the registry (InstrumentFactory.createInstrument), and the live edit path
 * (ToneEngine.updateToneJsSynthInPlace), asserted on the real Tone property it sets; and, where the knob is audible,
 * on audio rendered by Tone.Offline from the factory's instrument. Real Tone on node-web-audio-api; only an
 * OfflineAudioContext ever renders, so no test here can reach the speakers.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import type * as ToneNS from 'tone';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { InstrumentFactory as InstrumentFactoryT } from '../../InstrumentFactory';
import {
  renderOffline, toneAmplitude, peakHz, rms, zeroCrossHz, windows, SAMPLE_RATE, type Rendered,
} from './toneKnobRender';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- Tone keeps its voices private

let Tone: typeof ToneNS;
let Factory: typeof InstrumentFactoryT;
let engine: {
  getInstrument: (id: number, c: InstrumentConfig, ch?: number) => unknown;
  disposeInstrument: (id: number) => void;
  updateToneJsSynthInPlace: (id: number, c: InstrumentConfig) => void;
};
let K: typeof import('../toneSynthKnobs');
let voiceSourceOf: typeof import('../toneVoiceProbe').voiceSourceOf;
let factoryCreate: typeof import('../../factories/ToneJSSynthFactory').createToneJSSynth;

beforeAll(async () => {
  installRealWebAudio();
  Tone = await import('tone');
  K = await import('../toneSynthKnobs');
  voiceSourceOf = (await import('../toneVoiceProbe')).voiceSourceOf;
  Factory = (await import('../../InstrumentFactory')).InstrumentFactory;
  factoryCreate = (await import('../../factories/ToneJSSynthFactory')).createToneJSSynth;
  engine = (await import('../../ToneEngine')).getToneEngine() as unknown as typeof engine;
}, 60000);

const ids: number[] = [];
afterEach(() => { for (const id of ids.splice(0)) engine.disposeInstrument(id); });
let nextId = 9000;

const cfg = (synthType: string, patch: Record<string, unknown> = {}): InstrumentConfig => ({
  id: 1, name: 'knob test', type: 'synth', synthType, volume: -12, pan: 0,
  oscillator: { type: 'sine', detune: 0, octave: 0 },
  envelope: { attack: 5, decay: 0, sustain: 100, release: 50 },
  ...patch,
}) as unknown as InstrumentConfig;

/** The engine creates the instrument (the inline switch / the registry, as in the app) and a test edits it live. */
function engineMake(synthType: string, patch: Record<string, unknown> = {}, channel = 100): { id: number; node: Any; voice: Any; config: InstrumentConfig } {
  const id = nextId++;
  ids.push(id);
  const config = { ...cfg(synthType, patch), id } as InstrumentConfig;
  const inst = engine.getInstrument(id, config, channel) as object;
  const node = voiceSourceOf(inst) as Any;
  return { id, node, voice: voiceOf(node), config };
}
/** The Tone voice behind a PolySynth (its dummy voice carries every option), else the node itself. */
const voiceOf = (node: Any): Any => (node._dummyVoice ?? node);
function engineEdit(made: { id: number; config: InstrumentConfig }, patch: Record<string, unknown>): void {
  made.config = { ...made.config, ...patch } as InstrumentConfig;
  engine.updateToneJsSynthInPlace(made.id, made.config);
}

type Play = { note?: string | number; hold?: number; at?: number };
function play(inst: unknown, synthType: string, { note = 'A4', hold = 0.8, at = 0.05 }: Play = {}): void {
  const i = inst as Any;
  if (synthType === 'MetalSynth' || synthType === 'NoiseSynth') i.triggerAttackRelease(hold, at);
  else i.triggerAttackRelease(note, hold, at);
}

/** Render a note of the instrument the registry builds for `config`. */
async function render(config: InstrumentConfig, seconds = 1.2, p: Play = {}): Promise<Rendered> {
  return renderOffline(Tone, seconds, () => {
    const inst = Factory.createInstrument(config) as unknown as Any;
    inst.connect(Tone.getDestination());
    play(inst, config.synthType, p);
  });
}

describe('the voice rig: oscillator detune and octave', () => {
  it.each(['Synth', 'MonoSynth', 'FMSynth', 'ToneAM'])('%s: Detune and Octave set the sounding pitch (registry-built instrument, rendered)', async (type) => {
    const flat = await render(cfg(type), 1, { note: 440 });
    const fc = peakHz(flat, 400, 480, 0.3, 0.9, 0.5);
    expect(fc).toBeCloseTo(440, 0);
    const detuned = await render(cfg(type, { oscillator: { type: 'sine', detune: 100, octave: 0 } }), 1, { note: 440 });
    expect(peakHz(detuned, 400, 480, 0.3, 0.9, 0.5)).toBeCloseTo(440 * 2 ** (100 / 1200), 0);
    const octave = await render(cfg(type, { oscillator: { type: 'sine', detune: 0, octave: 1 } }), 1, { note: 440 });
    expect(peakHz(octave, 800, 960, 0.3, 0.9, 0.5)).toBeCloseTo(880, 0);
    const both = await render(cfg(type, { oscillator: { type: 'sine', detune: -50, octave: -1 } }), 1, { note: 440 });
    expect(peakHz(both, 190, 230, 0.3, 0.9, 0.25)).toBeCloseTo(220 * 2 ** (-50 / 1200), 0);
  });

  it('DuoSynth: Octave moves the pitch, Detune stays the vibrato depth it always was', async () => {
    // The Duo's own default vibrato (+-25 cents at 5 Hz) wobbles the line, so the peak is judged to within a semitone.
    const flat = await render(cfg('DuoSynth'), 1, { note: 440 });
    expect(Math.abs(peakHz(flat, 400, 480, 0.3, 0.9, 1) - 440)).toBeLessThan(440 * 0.03);
    const octave = await render(cfg('DuoSynth', { oscillator: { type: 'sine', detune: 0, octave: 1 } }), 1, { note: 440 });
    expect(Math.abs(peakHz(octave, 800, 960, 0.3, 0.9, 1) - 880)).toBeLessThan(880 * 0.03);
    const config = cfg('DuoSynth', { oscillator: { type: 'sine', detune: 80, octave: 0 } });
    expect((K.toneVoiceOptions('DuoSynth', config) as Any).vibratoAmount).toBe(0.8);
    expect((K.toneRigSettings('DuoSynth', config)).detuneCents).toBe(0);
  });

  it('engine path: a live edit of Detune and Octave reaches the rig of every voice (inline switch, tracker and live channels)', () => {
    for (const channel of [0, 100]) {
      const made = engineMake('Synth', {}, channel);
      expect(made.voice.rig.detuneCents).toBe(0);
      engineEdit(made, { oscillator: { type: 'sine', detune: 25, octave: 2 } });
      expect(voiceOf(made.node).rig.detuneCents).toBe(25 + 2400);
      if (made.node._voices) for (const v of made.node._voices) expect(v.rig.detuneCents).toBe(2425);
    }
  });
});

describe('the voice rig: pitch envelope', () => {
  const env = { enabled: true, amount: 12, attack: 0, decay: 200, sustain: 0, release: 100 };

  it('Synth: the pitch starts an octave up and falls to the note over the decay (rendered)', async () => {
    const r = await render(cfg('Synth', { pitchEnvelope: env }), 1.2, { note: 440, hold: 1 });
    const start = zeroCrossHz(r, 0.055, 0.075);
    const late = zeroCrossHz(r, 0.5, 0.9);
    expect(start).toBeGreaterThan(780);
    expect(start).toBeLessThan(900);
    expect(late).toBeCloseTo(440, -1);
    const off = await render(cfg('Synth', { pitchEnvelope: { ...env, enabled: false } }), 1.2, { note: 440, hold: 1 });
    expect(zeroCrossHz(off, 0.055, 0.075)).toBeCloseTo(440, -1);
  });

  it('Sustain holds a share of the Amount, Attack ramps in, and a negative Amount bends down (the shape the curve draws)', async () => {
    const held = await render(cfg('Synth', { pitchEnvelope: { ...env, sustain: 50 } }), 1.2, { note: 440, hold: 1 });
    expect(zeroCrossHz(held, 0.6, 0.9)).toBeCloseTo(440 * 2 ** (6 / 12), -1);
    const slow = await render(cfg('Synth', { pitchEnvelope: { ...env, attack: 300, decay: 100 } }), 1.2, { note: 440, hold: 1 });
    expect(zeroCrossHz(slow, 0.055, 0.1)).toBeLessThan(500); // still near the base while the attack ramps in
    expect(zeroCrossHz(slow, 0.3, 0.36)).toBeGreaterThan(640);
    const down = await render(cfg('Synth', { pitchEnvelope: { ...env, amount: -12 } }), 1.2, { note: 880, hold: 1 });
    expect(zeroCrossHz(down, 0.055, 0.075)).toBeLessThan(500);
    const shape = K.pitchEnvelopeShape({ ...env, sustain: 50 })!;
    expect(K.pitchEnvelopeCentsAt(shape, 0)).toBe(1200);
    expect(K.pitchEnvelopeCentsAt(shape, 1)).toBe(600);
    expect(K.pitchEnvelopeCentsAt(shape, 1.05, 1)).toBeCloseTo(300, 5); // half way through the 100 ms release
  });

  it.each(['MonoSynth', 'DuoSynth', 'FMSynth', 'ToneAM'])('%s: the envelope bends the pitch of a note on that voice too (carrier line, rendered)', async (type) => {
    // FM with index 0 and AM keep the carrier as the strongest line; the Duo's second voice is a fifth up, so look below 700 Hz.
    const config = cfg(type, { pitchEnvelope: env, modulationIndex: 0 });
    const r = await render(config, 1.2, { note: 440, hold: 1 });
    const duo = type === 'DuoSynth';
    const early = peakHz(r, duo ? 600 : 300, duo ? 1000 : 1100, 0.055, 0.085, 5);
    const late = peakHz(r, 300, duo ? 520 : 1100, 0.6, 0.9, 5);
    expect(late).toBeGreaterThan(420);
    expect(late).toBeLessThan(460);
    expect(early).toBeGreaterThan(700); // an octave up (880 Hz) at the start of a 200 ms fall
  });

  it('engine path: a live edit turns the envelope on without recreating the instrument', () => {
    const made = engineMake('MonoSynth');
    expect(made.voice.rig.pitchEnvelope).toBeNull();
    const before = made.node;
    engineEdit(made, { pitchEnvelope: env });
    expect(made.voice.rig.pitchEnvelope).toMatchObject({ peakCents: 1200, sustainCents: 0, decayS: 0.2 });
    expect(voiceSourceOf(engine.getInstrument(made.id, made.config, 100) as object)).toBe(before);
  });
});

describe('the voice rig: LFO', () => {
  const lfo = (extra: Record<string, unknown>) => ({ enabled: true, waveform: 'sine', rate: 5, pitchAmount: 0, volumeAmount: 0, filterAmount: 0, ...extra });

  it('vibrato: the pitch swings by the Vibrato Depth in cents at the LFO rate (rendered)', async () => {
    const steady = await render(cfg('Synth'), 1.5, { note: 440, hold: 1.3 });
    const swing = (r: Rendered) => { const f = windows(r, 0.2, 1.2, 0.02, zeroCrossHz).filter((x) => x > 0); return Math.max(...f) / Math.min(...f); };
    expect(swing(steady)).toBeLessThan(1.005);
    const vibrato = await render(cfg('Synth', { lfo: lfo({ pitchAmount: 100 }) }), 1.5, { note: 440, hold: 1.3 });
    expect(swing(vibrato)).toBeGreaterThan(2 ** (160 / 1200)); // +-100 cents is 2^(200/1200) end to end
    expect(swing(vibrato)).toBeLessThan(2 ** (240 / 1200));
    const off = await render(cfg('Synth', { lfo: lfo({ pitchAmount: 100, enabled: false }) }), 1.5, { note: 440, hold: 1.3 });
    expect(swing(off)).toBeLessThan(1.005);
  });

  it('vibrato rate: Rate sets the number of swings per second', async () => {
    const r = await render(cfg('Synth', { lfo: lfo({ pitchAmount: 100, rate: 4 }) }), 1.6, { note: 440, hold: 1.5 });
    const f = windows(r, 0.1, 1.1, 0.01, zeroCrossHz);
    const mean = f.reduce((a, b) => a + b, 0) / f.length;
    let crossings = 0;
    for (let i = 1; i < f.length; i++) if ((f[i - 1] - mean) * (f[i] - mean) < 0) crossings++;
    expect(crossings).toBeGreaterThanOrEqual(7); // 4 Hz over one second: 8 crossings of the mean
    expect(crossings).toBeLessThanOrEqual(9);
  });

  it('tremolo: the level swings between full and (1 - depth) at the LFO rate (rendered)', async () => {
    const level = (r: Rendered) => windows(r, 0.2, 1.2, 0.01, rms);
    const steady = level(await render(cfg('Synth'), 1.5, { note: 440, hold: 1.3 }));
    expect(Math.min(...steady) / Math.max(...steady)).toBeGreaterThan(0.98);
    const deep = level(await render(cfg('Synth', { lfo: lfo({ volumeAmount: 100 }) }), 1.5, { note: 440, hold: 1.3 }));
    expect(Math.min(...deep) / Math.max(...deep)).toBeLessThan(0.1);
    const half = level(await render(cfg('Synth', { lfo: lfo({ volumeAmount: 50 }) }), 1.5, { note: 440, hold: 1.3 }));
    expect(Math.min(...half) / Math.max(...half)).toBeGreaterThan(0.4);
    expect(Math.min(...half) / Math.max(...half)).toBeLessThan(0.6);
    expect(Math.max(...deep) / Math.max(...steady)).toBeGreaterThan(0.9); // the peaks stay at the voice's level: it does not get louder
    expect(Math.max(...deep) / Math.max(...steady)).toBeLessThan(1.1);
  });

  it('MonoSynth cutoff: Filter Depth swings the brightness with the LFO (rendered); the other voices have no such knob', async () => {
    const fe = { baseFrequency: 300, octaves: 2, attack: 1, decay: 1, sustain: 100, release: 50 };
    const bright = (r: Rendered) => windows(r, 0.3, 1.3, 0.05, (x, a, b) => toneAmplitude(x, 1760, a, b)); // harmonic 8 of A3 220 Hz
    const mono = (extra: Record<string, unknown>) => render(cfg('MonoSynth', {
      oscillator: { type: 'sawtooth', detune: 0, octave: 0 }, filterEnvelope: fe, filter: { type: 'lowpass', Q: 1 }, lfo: lfo(extra),
    }), 1.5, { note: 'A3', hold: 1.4 });
    const steady = bright(await mono({ filterAmount: 0, pitchAmount: 0, volumeAmount: 0, enabled: false }));
    const swung = bright(await mono({ filterAmount: 100, rate: 2 }));
    const spread = (v: number[]) => Math.max(...v) / Math.max(1e-9, Math.min(...v));
    expect(spread(steady)).toBeLessThan(1.2);
    expect(spread(swung)).toBeGreaterThan(3);
    expect(K.lfoSettingsOf('Synth', cfg('Synth', { lfo: lfo({ filterAmount: 100 }) }))).toBeNull(); // no filter on a Synth: nothing to modulate
  });

  it('engine path: Rate, Waveform and the depths reach the LFO of a live voice, and enabling it builds the nodes', () => {
    const made = engineMake('Synth', {}, 0);
    expect(made.voice.rig.lfo).toBeNull();
    engineEdit(made, { lfo: lfo({ rate: 7, waveform: 'square', pitchAmount: 30, volumeAmount: 20 }) });
    expect(made.voice.rig.lfo).toMatchObject({ rateHz: 7, type: 'square', pitchCents: 30, volumeDepth: 0.2 });
    engineEdit(made, { lfo: lfo({ rate: 3, waveform: 'triangle', pitchAmount: 30, volumeAmount: 20 }) });
    expect(made.voice.rig.lfo).toMatchObject({ rateHz: 3, type: 'triangle' });
    engineEdit(made, { lfo: lfo({ enabled: false, pitchAmount: 30 }) });
    expect(made.voice.rig.lfo).toBeNull();
  });
});

describe('FMSynth and AMSynth: modulation index, harmonicity, modulator', () => {
  const fm = (extra: Record<string, unknown>) => cfg('FMSynth', {
    modulation: { type: 'sine' }, modulationEnvelope: { attack: 0, decay: 0, sustain: 100, release: 50 }, ...extra,
  });
  const lineRatios = (r: Rendered, fc: number, ratios: number[], carrierFrom = 0.3) => ratios.map((x) => toneAmplitude(r, x * fc, carrierFrom, 1));

  it('the rendered sidebands follow the FM formula the editor draws: Bessel lines at carrier + k x modulator (harmonicity 3, no overlap)', async () => {
    const { fmSpectrum } = await import('@/components/instruments/curves/toneCurves');
    const r = await render(fm({ modulationIndex: 10, harmonicity: 3 }), 1.2, { note: 400, hold: 1 });
    const predicted = fmSpectrum(10, 3);
    expect(predicted.length).toBeGreaterThan(4);
    const gain = toneAmplitude(r, 400, 0.3, 1) / predicted.find((l) => l.ratio === 1)!.amplitude; // the voice's output gain
    for (const line of predicted.filter((l) => l.amplitude > 0.05)) {
      expect(toneAmplitude(r, line.ratio * 400, 0.3, 1) / gain, `line at ${line.ratio}x`).toBeCloseTo(line.amplitude, 1);
    }
  });

  it('lines that fold below 0 Hz add as the curve says (index 5, harmonicity 2: k=-1 lands on the carrier)', async () => {
    const { fmSpectrum } = await import('@/components/instruments/curves/toneCurves');
    const r = await render(fm({ modulationIndex: 5, harmonicity: 2 }), 1.2, { note: 400, hold: 1 });
    const predicted = fmSpectrum(5, 2);
    const [gainRef] = lineRatios(r, 400, [1]);
    const gain = gainRef / predicted[0].amplitude;
    for (const line of predicted.slice(0, 3)) expect(toneAmplitude(r, line.ratio * 400, 0.3, 1) / gain).toBeCloseTo(line.amplitude, 1);
  });

  it('Modulation Index scales the sidebands and Harmonicity moves them (rendered, registry instrument)', async () => {
    const low = await render(fm({ modulationIndex: 2, harmonicity: 3 }), 1.2, { note: 400, hold: 1 });
    const high = await render(fm({ modulationIndex: 20, harmonicity: 3 }), 1.2, { note: 400, hold: 1 });
    const side = (r: Rendered) => toneAmplitude(r, 4 * 400, 0.3, 1) / toneAmplitude(r, 400, 0.3, 1);
    expect(side(high)).toBeGreaterThan(side(low) * 2);
    // harmonicity 3 puts the first upper sideband at 4x (1600 Hz); 3.5 moves it to 4.5x (1800 Hz)
    const wider = await render(fm({ modulationIndex: 10, harmonicity: 3.5 }), 1.2, { note: 400, hold: 1 });
    const at = (r: Rendered, hz: number) => toneAmplitude(r, hz, 0.3, 1);
    expect(at(high, 1600)).toBeGreaterThan(at(high, 1800) * 5);
    expect(at(wider, 1800)).toBeGreaterThan(at(wider, 1600) * 5);
  });

  it('the Modulator envelope and waveform are read: a slow modulator attack keeps the early sound pure, a square modulator changes the lines', async () => {
    const fast = await render(fm({ modulationIndex: 20, harmonicity: 3 }), 1.2, { note: 400, hold: 1 });
    const slow = await render(fm({ modulationIndex: 20, harmonicity: 3, modulationEnvelope: { attack: 800, decay: 0, sustain: 100, release: 50 } }), 1.2, { note: 400, hold: 1 });
    const purity = (r: Rendered) => toneAmplitude(r, 4 * 400, 0.06, 0.2) / Math.max(1e-9, toneAmplitude(r, 400, 0.06, 0.2));
    expect(purity(fast)).toBeGreaterThan(purity(slow) * 3);
    const square = await render(fm({ modulationIndex: 20, harmonicity: 3, modulation: { type: 'square' } }), 1.2, { note: 400, hold: 1 });
    const sine = fast;
    expect(Math.abs(toneAmplitude(square, 5 * 400, 0.3, 1) - toneAmplitude(sine, 5 * 400, 0.3, 1))).toBeGreaterThan(0.05);
  });

  it('AM: sidebands sit at carrier +- harmonicity x carrier, at the amplitude the curve draws', async () => {
    const { amSpectrum } = await import('@/components/instruments/curves/toneCurves');
    const am = (extra: Record<string, unknown>) => cfg('ToneAM', { modulation: { type: 'sine' }, modulationEnvelope: { attack: 0, decay: 0, sustain: 100, release: 50 }, ...extra });
    const r = await render(am({ harmonicity: 2 }), 1.2, { note: 400, hold: 1 });
    const predicted = amSpectrum(2);
    const carrier = toneAmplitude(r, 400, 0.3, 1);
    expect(toneAmplitude(r, 3 * 400, 0.3, 1) / carrier).toBeCloseTo(predicted.find((l) => l.ratio === 3)!.amplitude, 1);
    // harmonicity 1.5 puts the sidebands at 2.5x (1000 Hz) and, folded up from -0.5x, 0.5x (200 Hz); 0.5 at 1.5x (600 Hz) and 0.5x
    const far = await render(am({ harmonicity: 1.5 }), 1.2, { note: 400, hold: 1 });
    const near = await render(am({ harmonicity: 0.5 }), 1.2, { note: 400, hold: 1 });
    expect(toneAmplitude(far, 1000, 0.3, 1) / toneAmplitude(far, 400, 0.3, 1)).toBeCloseTo(amSpectrum(1.5).find((l) => l.ratio === 2.5)!.amplitude, 1);
    expect(toneAmplitude(near, 600, 0.3, 1) / toneAmplitude(near, 400, 0.3, 1)).toBeCloseTo(amSpectrum(0.5).find((l) => l.ratio === 1.5)!.amplitude, 1);
    expect(toneAmplitude(far, 600, 0.3, 1)).toBeLessThan(toneAmplitude(far, 1000, 0.3, 1) / 4); // nothing left at the other sideband
    expect(toneAmplitude(near, 1000, 0.3, 1)).toBeLessThan(toneAmplitude(near, 600, 0.3, 1) / 4);
  });

  it.each([
    ['FMSynth', 100, { modulationIndex: 3, harmonicity: 1.5, modulationEnvelope: { attack: 20, decay: 30, sustain: 40, release: 60 }, modulation: { type: 'triangle' } }],
    ['FMSynth', 0, { modulationIndex: 3, harmonicity: 1.5 }],
    ['ToneAM', 100, { harmonicity: 2.5, modulationEnvelope: { attack: 20, decay: 30, sustain: 40, release: 60 }, modulation: { type: 'sawtooth' } }],
  ])('engine path: %s (channel %i) creation and live edit set the Tone properties', (type, channel, patch) => {
    const made = engineMake(type, patch, channel);
    const v = made.voice;
    const p = patch as Any;
    expect(v.harmonicity.value).toBeCloseTo(p.harmonicity, 6);
    if (type === 'FMSynth') expect(v.modulationIndex.value).toBeCloseTo(p.modulationIndex, 6);
    if (p.modulation) expect(v.modulation.type).toBe(p.modulation.type);
    if (p.modulationEnvelope) {
      expect(v.modulationEnvelope.attack).toBeCloseTo(0.02, 6);
      expect(v.modulationEnvelope.decay).toBeCloseTo(0.03, 6);
      expect(v.modulationEnvelope.sustain).toBeCloseTo(0.4, 6);
      expect(v.modulationEnvelope.release).toBeCloseTo(0.06, 6);
    }
    engineEdit(made, { ...(type === 'FMSynth' ? { modulationIndex: 33 } : {}), harmonicity: 7, ...(p.modulation ? { modulation: { type: 'sine' } } : {}) });
    const live = voiceOf(made.node);
    expect(live.harmonicity.value).toBe(7);
    if (type === 'FMSynth') expect(live.modulationIndex.value).toBe(33);
    if (p.modulation) expect(live.modulation.type).toBe('sine');
    if (made.node._voices) for (const voice of made.node._voices as Any[]) expect(voice.harmonicity.value).toBe(7);
  });

  it('the registry and the ToneJSSynthFactory paths build the same FM voice from the same keys', () => {
    const config = cfg('FMSynth', { modulationIndex: 12.5, harmonicity: 4.25 });
    const viaRegistry = voiceOf(voiceSourceOf(Factory.createInstrument(config) as object) as Any);
    const viaFactory = voiceOf(voiceSourceOf(factoryCreate(config) as object) as Any);
    for (const v of [viaRegistry, viaFactory]) {
      expect(v.modulationIndex.value).toBeCloseTo(12.5, 6);
      expect(v.harmonicity.value).toBeCloseTo(4.25, 6);
    }
  });
});

describe('MonoSynth: the cutoff is the filter envelope sweep', () => {
  const saw = { oscillator: { type: 'sawtooth', detune: 0, octave: 0 } };
  // harmonic 4 of A3 (880 Hz): the filter's job; the overall RMS barely moves because the fundamental carries most of a saw's energy
  const bright = (r: Rendered) => toneAmplitude(r, 880, 0.3, 0.9);

  it('Base Cutoff and Sweep Octaves change the sound (rendered)', async () => {
    const fe = (baseFrequency: number, octaves: number) => ({ baseFrequency, octaves, attack: 1, decay: 1, sustain: 0, release: 50 });
    const dark = await render(cfg('MonoSynth', { ...saw, filterEnvelope: fe(120, 0) }), 1.2, { note: 'A3', hold: 1 });
    const open = await render(cfg('MonoSynth', { ...saw, filterEnvelope: fe(8000, 0) }), 1.2, { note: 'A3', hold: 1 });
    expect(bright(open)).toBeGreaterThan(bright(dark) * 3);
    // sustain 0 at base 300 Hz: the sweep only lasts the attack, so the late sound is as dark as the base; sustain 100 holds the peak
    const sweepHeld = (octaves: number) => render(cfg('MonoSynth', { ...saw, filterEnvelope: { baseFrequency: 300, octaves, attack: 1, decay: 1, sustain: 100, release: 50 } }), 1.2, { note: 'A3', hold: 1 });
    expect(bright(await sweepHeld(6))).toBeGreaterThan(bright(await sweepHeld(0)) * 2);
  });

  it('Resonance and Type are read: a high Q lifts the corner, a highpass removes the fundamental', async () => {
    const fe = { baseFrequency: 440, octaves: 0, attack: 1, decay: 1, sustain: 100, release: 50 };
    const flat = await render(cfg('MonoSynth', { ...saw, filterEnvelope: fe, filter: { type: 'lowpass', Q: 1 } }), 1.2, { note: 'A3', hold: 1 });
    const reso = await render(cfg('MonoSynth', { ...saw, filterEnvelope: fe, filter: { type: 'lowpass', Q: 15 } }), 1.2, { note: 'A3', hold: 1 });
    expect(toneAmplitude(reso, 440, 0.3, 0.9)).toBeGreaterThan(toneAmplitude(flat, 440, 0.3, 0.9) * 2);
    const high = await render(cfg('MonoSynth', { ...saw, filterEnvelope: { ...fe, baseFrequency: 2000 }, filter: { type: 'highpass', Q: 1 } }), 1.2, { note: 'A3', hold: 1 });
    expect(toneAmplitude(high, 220, 0.3, 0.9)).toBeLessThan(toneAmplitude(flat, 220, 0.3, 0.9) / 5);
  });

  it('engine path: creation and a live edit set filterEnvelope.baseFrequency / octaves and the filter type and Q; the inline switch now builds the filter too', () => {
    const made = engineMake('MonoSynth', { filterEnvelope: { baseFrequency: 500, octaves: 2 }, filter: { type: 'highpass', Q: 4, rolloff: -24 } });
    expect(made.node.filterEnvelope.baseFrequency).toBeCloseTo(500, 6);
    expect(made.node.filterEnvelope.octaves).toBe(2);
    expect(made.node.filter.type).toBe('highpass');
    expect(made.node.filter.Q.value).toBe(4);
    expect(made.node.filter.rolloff).toBe(-24);
    engineEdit(made, { filterEnvelope: { baseFrequency: 900, octaves: 5 }, filter: { type: 'bandpass', Q: 9, rolloff: -24 } });
    expect(made.node.filterEnvelope.baseFrequency).toBeCloseTo(900, 6);
    expect(made.node.filterEnvelope.octaves).toBe(5);
    expect(made.node.filter.type).toBe('bandpass');
    expect(made.node.filter.Q.value).toBe(9);
  });
});

describe('PluckSynth', () => {
  // Tone's comb filter is an AudioWorklet loaded from a blob URL, which node-web-audio-api cannot load (and the failed load
  // is an unhandled rejection inside Tone), so a Pluck cannot be rendered here: its tests assert the Tone voice's
  // properties. The module request is held pending, which is also what a slow load looks like.
  let restore: (() => void) | null = null;
  beforeAll(() => {
    const proto = Tone.Context.prototype as unknown as { addAudioWorkletModule: () => Promise<void> };
    const original = proto.addAudioWorkletModule;
    proto.addAudioWorkletModule = () => new Promise<void>(() => {});
    restore = () => { proto.addAudioWorkletModule = original; };
  });
  afterAll(() => { restore?.(); });
  const pluck = (extra: Record<string, unknown>) => cfg('PluckSynth', { parameters: extra });

  it('engine path: Noise, Dampening, Resonance and Release reach the Tone voice at creation and on a live edit', () => {
    const made = engineMake('PluckSynth', { parameters: { attackNoise: 3, dampening: 1200, resonance: 0.9, release: 2 } });
    const v = made.voice;
    expect(v.attackNoise).toBe(3);
    expect(v.dampening).toBeCloseTo(1200, 3);
    expect(v.resonance).toBe(0.9);
    expect(v.release).toBe(2);
    engineEdit(made, { parameters: { attackNoise: 5, dampening: 9000, resonance: 0.5, release: 0.2 } });
    const live = voiceOf(made.node);
    expect([live.attackNoise, live.resonance, live.release]).toEqual([5, 0.5, 0.2]);
    expect(live.dampening).toBeCloseTo(9000, 3);
    engine.disposeInstrument(made.id); // before its comb filter worklet is ready
  });

  it('the registry wrapper and the ToneJSSynthFactory wrapper expose the same Tone voice, and a live edit reaches it through the wrapper', () => {
    const config = pluck({ attackNoise: 2, dampening: 700, resonance: 0.6, release: 0.5 });
    for (const inst of [Factory.createInstrument(config), factoryCreate(config)]) {
      const node = voiceSourceOf(inst as object) as Any;
      expect(node.attackNoise).toBe(2);
      expect(node.dampening).toBeCloseTo(700, 3);
      expect(node.resonance).toBe(0.6);
      expect(node.release).toBe(0.5);
      K.applyToneVoiceOptions(node, 'PluckSynth', pluck({ attackNoise: 4, dampening: 800, resonance: 0.3, release: 3 }));
      expect([node.attackNoise, node.resonance, node.release]).toEqual([4, 0.3, 3]);
    }
  });

  it('the defaults are the layout defaults, not the 0.98 / 3000 / 0.96 the three paths used to disagree on', () => {
    expect(K.toneVoiceOptions('PluckSynth', cfg('PluckSynth'))).toEqual({ attackNoise: 1, dampening: 4000, resonance: 0.7, release: 1 });
  });
});

describe('MetalSynth and MembraneSynth', () => {
  it('Metal: Harmonicity, Modulation Index, Octaves and Resonance reach the Tone voice (engine creation, live edit, registry)', () => {
    const made = engineMake('MetalSynth', { parameters: { harmonicity: 2.5, modulationIndex: 11, octaves: 3, resonance: 900 } });
    const n = made.node;
    expect([n.harmonicity, n.modulationIndex, n.octaves]).toEqual([2.5, 11, 3]);
    expect(n.resonance).toBeCloseTo(900, 3);
    engineEdit(made, { parameters: { harmonicity: 6, modulationIndex: 50, octaves: 1, resonance: 7000 } });
    expect([n.harmonicity, n.modulationIndex, n.octaves]).toEqual([6, 50, 1]);
    expect(n.resonance).toBeCloseTo(7000, 3);
    const viaRegistry = voiceSourceOf(Factory.createInstrument(cfg('MetalSynth', { parameters: { harmonicity: 3.5 } })) as object) as Any;
    expect(viaRegistry.harmonicity).toBe(3.5);
  });

  it('Metal: Resonance (the highpass corner) and Octaves change the rendered sound', async () => {
    const hit = (parameters: Record<string, number>) => render(cfg('MetalSynth', { parameters, envelope: { attack: 1, decay: 400, release: 100 } }), 1, { hold: 0.3 });
    const band = (r: Rendered, lo: number, hi: number) => { let s = 0; for (let hz = lo; hz < hi; hz += 150) s += toneAmplitude(r, hz, 0.06, 0.3) ** 2; return Math.sqrt(s); };
    const low = await hit({ resonance: 200 });
    const high = await hit({ resonance: 9000 });
    expect(band(low, 500, 3000)).toBeGreaterThan(band(high, 500, 3000) * 2);
    const narrow = await hit({ octaves: 0 });
    const wide = await hit({ octaves: 6 });
    expect(Math.abs(rms(narrow, 0.06, 0.3) - rms(wide, 0.06, 0.3))).toBeGreaterThan(0.002);
  });

  it('Membrane: Pitch Decay and Octaves reach the Tone voice (engine creation, live edit)', () => {
    const made = engineMake('MembraneSynth', { parameters: { pitchDecay: 0.2, octaves: 4 } });
    expect(made.node.pitchDecay).toBe(0.2);
    expect(made.node.octaves).toBe(4);
    engineEdit(made, { parameters: { pitchDecay: 0.01, octaves: 9 } });
    expect(made.node.pitchDecay).toBe(0.01);
    expect(made.node.octaves).toBe(9);
  });

  it('Membrane: the Start Multiplier sets how far above the note the kick starts (Tone multiplies the note by it) and Pitch Decay how fast it falls (rendered)', async () => {
    const kick = (parameters: Record<string, number>) => render(cfg('MembraneSynth', { parameters, envelope: { attack: 1, decay: 600, release: 100 } }), 1, { note: 'C2', hold: 0.5 });
    const none = await kick({ octaves: 0, pitchDecay: 0.05 });
    const swept = await kick({ octaves: 6, pitchDecay: 0.05 });
    const settled = zeroCrossHz(none, 0.1, 0.3);
    expect(settled).toBeCloseTo(65.4, -1);
    expect(zeroCrossHz(swept, 0.052, 0.07)).toBeGreaterThan(settled * 2.5);
    const slow = await kick({ octaves: 6, pitchDecay: 0.4 });
    expect(zeroCrossHz(slow, 0.2, 0.3)).toBeGreaterThan(zeroCrossHz(swept, 0.2, 0.3) * 1.2);
  });
});

describe('one builder for every path', () => {
  it('the same config gives the same Tone options whichever path asks (builder), and the store asks the same question for a live edit', () => {
    const c = cfg('FMSynth', { modulationIndex: 4, harmonicity: 2, lfo: { enabled: true, waveform: 'sine', rate: 3, pitchAmount: 10, volumeAmount: 0, filterAmount: 0 } });
    expect(K.toneVoiceOptions('FMSynth', c)).toEqual(K.toneVoiceOptions('FMSynth', c));
    expect((K.toneVoiceOptions('FMSynth', c) as Any).rig.lfo).toMatchObject({ rateHz: 3, pitchCents: 10 });
    for (const key of ['lfo', 'pitchEnvelope', 'parameters', 'modulationIndex', 'harmonicity', 'modulationEnvelope', 'modulation', 'oscillator', 'filterEnvelope']) {
      expect(K.touchesToneVoice({ [key]: {} } as never), key).toBe(true);
    }
    expect(K.touchesToneVoice({ name: 'x' } as never)).toBe(false);
  });

  it('the probe reads the LFO clock of a rigged voice: the phase restarts at the note', async () => {
    const { ToneVoiceProbe } = await import('../toneVoiceProbe');
    const probe = new ToneVoiceProbe({ now: () => Tone.now() });
    const made = engineMake('Synth', { lfo: { enabled: true, waveform: 'sine', rate: 4, pitchAmount: 10, volumeAmount: 0, filterAmount: 0 } }, 100);
    const inst = engine.getInstrument(made.id, made.config, 100) as object;
    probe.track(made.id, inst);
    (inst as Any).triggerAttack('C4', Tone.now() - 0.05);
    expect(probe.voice(made.id)!.modLfoPhase).toBeCloseTo(0.2, 1); // 50 ms into a 4 Hz cycle
    probe.untrack(inst);
    expect(SAMPLE_RATE).toBe(44100);
  });
});
