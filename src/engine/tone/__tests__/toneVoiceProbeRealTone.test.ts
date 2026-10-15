/**
 * The voice probe against REAL Tone instruments (node-web-audio-api behind Tone), not stubs: the PolySynth internals
 * it reads (`_activeVoices`), Envelope.value, the MonoSynth FrequencyEnvelope cutoff and the factory wrappers'
 * registered sources must all exist on the Tone version in node_modules. The audio context never renders, so Tone's
 * clock is frozen; notes are attacked in the past so Envelope.value has something to report.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import type * as ToneNS from 'tone';
import type { ToneVoiceProbe as ToneVoiceProbeT } from '../toneVoiceProbe';
import type { InstrumentConfig } from '@typedefs/instrument';

let Tone: typeof ToneNS;
let probe: ToneVoiceProbeT;
const disposables: Array<{ dispose: () => unknown }> = [];

beforeAll(async () => {
  installRealWebAudio();
  Tone = await import('tone');
  const mod = await import('../toneVoiceProbe');
  probe = new mod.ToneVoiceProbe({ now: () => Tone.now() });
});
afterEach(() => { for (const d of disposables.splice(0)) { try { d.dispose(); } catch { /* already gone */ } } });

describe('voice probe on real Tone instruments', () => {
  it('PolySynth(Synth): reports an attack stage and the real Envelope.value of the voice', () => {
    const synth = new Tone.PolySynth(Tone.Synth, { envelope: { attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.4 } });
    disposables.push(synth);
    expect(probe.track(1, synth)).toBe(true);
    expect(probe.voice(1)).toBeNull();
    const now = Tone.now();
    synth.triggerAttack('C4', now - 0.05);
    const r = probe.voice(1)!;
    expect(r.stage).toBe('attack');
    expect(r.elapsedMs).toBeCloseTo(50, 0);
    expect(r.level).toBeGreaterThan(0.3); // linear attack, halfway
    expect(r.level).toBeLessThan(0.7);
  });

  it('PolySynth: a triggerAttackRelease is seen as an attack and a scheduled release', () => {
    const synth = new Tone.PolySynth(Tone.Synth, { envelope: { attack: 0.01, decay: 0.05, sustain: 0.5, release: 0.4 } });
    disposables.push(synth);
    probe.track(2, synth);
    const now = Tone.now();
    synth.triggerAttackRelease('E4', 0.01, now - 0.1); // released 90 ms ago (Tone's clock stands at 0.1 s: no earlier time exists)
    expect(probe.voice(2)!.stage).toBe('release');
  });

  it('MonoSynth: the cutoff is the FrequencyEnvelope sweep, between base and base * 2^octaves', () => {
    const mono = new Tone.MonoSynth({ filterEnvelope: { attack: 0.1, decay: 0.2, sustain: 0.5, release: 1, baseFrequency: 200, octaves: 3, exponent: 2 } });
    disposables.push(mono);
    probe.track(3, mono);
    mono.triggerAttack('C3', Tone.now() - 0.05); // the filter envelope attacks over 0.1 s: about half way
    const r = probe.voice(3)!;
    expect(r.cutoffHz).toBeGreaterThan(200);
    expect(r.cutoffHz).toBeLessThan(1600);
    expect(r.stage).toBe('decay'); // the stage is the AMP envelope's (attack 5 ms), the cutoff is the filter envelope's
  });

  it('NoiseSynth and DuoSynth are read through their own trigger signatures; DuoSynth adds its vibrato clock', () => {
    const noise = new Tone.NoiseSynth({ envelope: { attack: 0.5, decay: 0.2, sustain: 0.5, release: 0.4 } });
    const duo = new Tone.DuoSynth();
    disposables.push(noise, duo);
    probe.track(4, noise);
    probe.track(5, duo);
    noise.triggerAttack(Tone.now() - 0.05);
    duo.triggerAttack('C3', Tone.now() - 0.05);
    expect(probe.voice(4)!.stage).toBe('attack');
    const d = probe.voice(5)!;
    expect(d.stage).toBe('sustain'); // voice0 envelope: attack 10 ms, no decay, sustain 1
    expect(d.lfoPhase).toBeTypeOf('number');
  });

  it('untrack puts the Tone methods back', () => {
    const mono = new Tone.MonoSynth();
    disposables.push(mono);
    const original = mono.triggerAttack;
    probe.track(6, mono);
    expect(mono.triggerAttack).not.toBe(original);
    probe.untrack(mono);
    expect(Object.prototype.hasOwnProperty.call(mono, 'triggerAttack')).toBe(false);
  });
});

describe('voice probe on the factory wrappers (the objects the engine really holds)', () => {
  const config = (synthType: string) => ({ id: 9, synthType, volume: -12 } as unknown as InstrumentConfig);

  it('createSynth: the wrapper hides its PolySynth; the registered source makes it readable', async () => {
    const { createSynth } = await import('../../factories/ToneJSSynthFactory');
    const wrapper = createSynth(config('Synth'));
    disposables.push(wrapper as unknown as { dispose: () => unknown });
    expect(probe.track(10, wrapper)).toBe(true);
    (wrapper as unknown as { triggerAttack: (n: string, t: number) => void }).triggerAttack('C4', Tone.now() - 0.01);
    expect(probe.voice(10)!.stage).toBe('attack');
  });

  it('createPWMSynth: reports the filter cutoff of its static filter and the chorus LFO phase', async () => {
    const { createPWMSynth } = await import('../../factories/ToneJSSynthFactory');
    const wrapper = createPWMSynth(config('PWMSynth'));
    disposables.push(wrapper as unknown as { dispose: () => unknown });
    probe.track(11, wrapper);
    (wrapper as unknown as { triggerAttack: (n: string, t: number) => void }).triggerAttack('C4', Tone.now() - 0.01);
    const r = probe.voice(11)!;
    expect(r.cutoffHz).toBe(4000); // DEFAULT_PWM_SYNTH.filter.cutoff
    expect(r.lfoPhase).toBeGreaterThanOrEqual(0);
    expect(r.lfoPhase).toBeLessThan(1);
  });

  // ChipSynth (its bit crusher cannot assign a curve twice on node-web-audio-api) and FormantSynth (CommunitySynthFactory
  // does not finish importing in this harness) register their sources by the same call but are not exercised here.
  it.each([
    ['SuperSaw', 'createSuperSaw', '../../factories/ToneJSSynthFactory'],
    ['PolySynth', 'createPolySynth', '../../factories/ToneJSSynthFactory'],
    ['StringMachine', 'createStringMachine', '../../factories/ToneJSSynthFactory'],
    ['FMSynth', 'createFMSynth', '../../factories/ToneJSSynthFactory'],
    ['ToneAM', 'createAMSynth', '../../factories/ToneJSSynthFactory'],
    ['DuoSynth', 'createDuoSynth', '../../factories/ToneJSSynthFactory'],
  ] as const)('%s wrapper: a note through the wrapper is reported', async (type, fn, path) => {
    const mod = (await import(/* @vite-ignore */ path)) as Record<string, (c: InstrumentConfig) => unknown>;
    const wrapper = mod[fn](config(type)) as { triggerAttack: (n: string, t: number) => void; dispose: () => unknown };
    disposables.push(wrapper);
    expect(probe.track(20, wrapper), `${type} wrapper is probe-able`).toBe(true);
    wrapper.triggerAttack('C4', Tone.now() - 0.005);
    const r = probe.voice(20);
    expect(r, `${type} reports a voice`).not.toBeNull();
    expect(Number.isFinite(r!.level)).toBe(true);
    probe.untrack(wrapper);
  });

  it('the registry MetalSynth wrapper (hides its MetalSynth) is reported', async () => {
    await import('../../registry/builtin/tone');
    const { SynthRegistry } = await import('../../registry/SynthRegistry');
    const wrapper = SynthRegistry.get('MetalSynth')!.create(config('MetalSynth')) as unknown as { triggerAttack: (n: string, t: number) => void; dispose: () => unknown };
    disposables.push(wrapper);
    expect(probe.track(21, wrapper)).toBe(true);
    wrapper.triggerAttack('C4', Tone.now() - 0.005);
    expect(probe.voice(21)).not.toBeNull();
  });
});
