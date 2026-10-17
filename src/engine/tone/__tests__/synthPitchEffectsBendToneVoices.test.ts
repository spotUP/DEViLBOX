/**
 * Regression: pitch effects (vibrato 4xy, portamento 1xx/2xx/3xx, arpeggio 0xy) were silent on Tone synths.
 * SynthEffectProcessor ends every pitch effect in ToneEngine.applySynthFrequency, which looked for a `.frequency`
 * on the instrument itself or read `voice.frequency` off PolySynth._activeVoices. The engine hands out factory
 * wrappers (polyWrapper, the DuoSynth wrapper) that have no `.frequency`, and _activeVoices holds
 * `{ midi, voice, released }` entries, not voices, so nothing was bent and a vibrato row sounded flat.
 *
 * Real Tone on a never-rendered context, instruments made through ToneEngine.getInstrument (as the replayer does).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import type { InstrumentConfig } from '@typedefs/instrument';

type Engine = {
  getInstrument: (id: number, c: InstrumentConfig, ch?: number) => unknown;
  applySynthFrequency: (id: number, hz: number, ch?: number, ramp?: number) => void;
  disposeInstrument: (id: number) => void;
};
type FreqParam = { getValueAtTime: (t: number) => number };
type VoiceLike = { frequency?: FreqParam };

let engine: Engine;
let ToneNS: typeof import('tone');
let voiceSourceOf: (o: object) => object;

beforeAll(async () => {
  installRealWebAudio();
  ToneNS = await import('tone');
  voiceSourceOf = (await import('../toneVoiceProbe')).voiceSourceOf;
  const { getToneEngine } = await import('../../ToneEngine');
  engine = getToneEngine() as unknown as Engine;
}, 60000);

const cfg = (id: number, synthType: string) => ({
  id, synthType, name: 't', volume: -12, pan: 0,
  oscillator: { type: 'sawtooth', detune: 0, octave: 0 },
  envelope: { attack: 10, decay: 200, sustain: 50, release: 400 },
} as unknown as InstrumentConfig);

/** The pitch the sounding voice will have once every scheduled change is applied. */
function soundingHz(inst: object): number {
  const source = voiceSourceOf(inst) as VoiceLike & { _activeVoices?: Array<{ voice: VoiceLike }> };
  const voice = source._activeVoices ? source._activeVoices[source._activeVoices.length - 1].voice : source;
  return voice.frequency!.getValueAtTime(ToneNS.now() + 10);
}

describe('ToneEngine.applySynthFrequency bends the sounding voice of every Tone synth', () => {
  it.each(['Synth', 'MonoSynth', 'DuoSynth', 'FMSynth', 'ToneAM'])('%s: a held C-4 moves to the effect frequency', (type) => {
    const id = 700 + type.length;
    const inst = engine.getInstrument(id, cfg(id, type), 100) as { triggerAttack: (n: string, t: number) => void };
    inst.triggerAttack('C4', ToneNS.now() - 0.05);
    expect(soundingHz(inst)).toBeCloseTo(261.63, 1);
    engine.applySynthFrequency(id, 277.18, 100);
    expect(soundingHz(inst)).toBeCloseTo(277.18, 1);
    engine.disposeInstrument(id);
  });
});
