/**
 * Reachability: the live voice markers read what ToneEngine.getInstrument creates. A synth made through the engine
 * (not built by the test) is watched by the voice probe under its instrument id, a note on it is reported, and
 * disposing the instrument stops the reporting. Real Tone on a never-rendered offline context (no device is opened).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import type { InstrumentConfig } from '@typedefs/instrument';

type Engine = { getInstrument: (id: number, c: InstrumentConfig, ch?: number) => unknown; disposeInstrument: (id: number) => void };
let engine: Engine;
let probe: typeof import('../toneVoiceProbe').toneVoiceProbe;
let ToneNS: typeof import('tone');

beforeAll(async () => {
  installRealWebAudio();
  ToneNS = await import('tone');
  probe = (await import('../toneVoiceProbe')).toneVoiceProbe;
  const { getToneEngine } = await import('../../ToneEngine');
  engine = getToneEngine() as unknown as Engine;
}, 60000);

const cfg = (id: number, synthType: string) => ({
  id, synthType, name: 't', volume: -12, pan: 0,
  oscillator: { type: 'sawtooth', detune: 0, octave: 0 },
  envelope: { attack: 100, decay: 200, sustain: 50, release: 400 },
} as unknown as InstrumentConfig);

describe('ToneEngine.getInstrument hands its Tone instruments to the voice probe', () => {
  it.each(['Synth', 'MonoSynth', 'DuoSynth', 'FMSynth', 'NoiseSynth'])('%s: a note is reported under the instrument id, and disposing ends it', (type) => {
    const id = 500 + type.length;
    const inst = engine.getInstrument(id, cfg(id, type), 100) as { triggerAttack: (...a: unknown[]) => void };
    expect(inst).toBeTruthy();
    const t = ToneNS.now() - 0.05;
    if (type === 'NoiseSynth') inst.triggerAttack(t); else inst.triggerAttack('C4', t);
    const r = probe.voice(id);
    expect(r, `${type} reports a voice`).not.toBeNull();
    expect(r!.stage).toBe('attack');
    engine.disposeInstrument(id);
    expect(probe.voice(id)).toBeNull();
  });
});
