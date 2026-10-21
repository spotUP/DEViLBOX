/**
 * Regression: a General MIDI import (PolySynth with top-level oscillator / envelope / filter) sounded "beepy".
 * Both PolySynth engine paths read the shadow fields polySynth.oscillator / envelope (migration fills them with
 * defaults: sawtooth, 50/500/70/100) and ignored config.filter and the octave; the tracker-channel path also left
 * Tone's default MonoSynth filter sweep on. A guitar (program 25) is a saw, 1/350/10/200 ms, lowpass 3500 Hz.
 *
 * Instruments are made through ToneEngine.getInstrument, the entry point the replayer and the keyboard use: a
 * channel below 100 is a tracker channel (monophonic), 100 and above the polyphonic keyboard path. Rendered with
 * real Tone on an OfflineAudioContext (node-web-audio-api); nothing opens an output device.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import type * as ToneNS from 'tone';
import type { InstrumentConfig } from '@typedefs/instrument';
import { renderOffline, toneAmplitude, rms, type Rendered } from './toneKnobRender';

type Engine = { getInstrument: (id: number, c: InstrumentConfig, ch?: number) => unknown; disposeInstrument: (id: number) => void };
type Playable = { connect: (d: unknown) => void; triggerAttackRelease: (n: string, d: number, t: number) => void };
type Builder = typeof import('../toneSynthKnobs');
type Probe = {
  voiceSourceOf: (o: object) => object;
  voiceFilterOf: (o: object) => { frequency: { value: number | string } } | null;
};

let Tone: typeof ToneNS;
let engine: Engine;
let probe: Probe;
let guitar: InstrumentConfig;
let createToneSynthNode: Builder['createToneSynthNode'];
let toneVoiceTypeOf: Builder['toneVoiceTypeOf'];

beforeAll(async () => {
  installRealWebAudio();
  Tone = await import('tone');
  const { getToneEngine } = await import('../../ToneEngine');
  engine = getToneEngine() as unknown as Engine;
  ({ createToneSynthNode, toneVoiceTypeOf } = await import('../toneSynthKnobs'));
  const p = await import('../toneVoiceProbe');
  probe = { voiceSourceOf: p.voiceSourceOf, voiceFilterOf: p.voiceFilterOf };
  const { gmProgramToInstrument } = await import('@/lib/import/GMSoundBank');
  const { DEFAULT_POLYSYNTH } = await import('@/types/instrument');
  // migration.ts fills the shadow fields with the PolySynth defaults on every load: the import must not depend on them
  guitar = { ...gmProgramToInstrument(25, 1, false), polySynth: { ...DEFAULT_POLYSYNTH } } as InstrumentConfig;
}, 60000);

const PATHS = [
  { name: 'tracker channel (monophonic)', channel: 0 },
  { name: 'keyboard (polyphonic)', channel: 100 },
] as const;

interface Played { audio: Rendered; oscType: string; filterHz: number }

/**
 * Read the voice's oscillator type and static cutoff. The sentinel: the MonoSynth's filterEnvelope base (no sweep) or
 * the poly voices' static Tone.Filter. NaN when the voice has no filter at all.
 */
function inspect(made: object): { oscType: string; filterHz: number } {
  const source = probe.voiceSourceOf(made) as {
    oscillator?: { type: string }; filterEnvelope?: { baseFrequency: number; octaves: number };
    get?: () => { oscillator?: { type: string } };
  };
  const oscType = String(source.oscillator?.type ?? source.get?.().oscillator?.type);
  let filterHz: number;
  if (source.filterEnvelope) filterHz = source.filterEnvelope.octaves === 0 ? source.filterEnvelope.baseFrequency : -1;
  else filterHz = Number(probe.voiceFilterOf(made)?.frequency.value);
  return { oscType, filterHz };
}

/** Make the instrument inside the offline context with `make`, play A3 for 1.5 s, read the voice while it sounds. */
async function play(make: () => Playable): Promise<Played> {
  let seen = { oscType: '', filterHz: NaN };
  const audio = await renderOffline(Tone, 2, () => {
    const made = make();
    made.connect(Tone.getDestination());
    made.triggerAttackRelease('A3', 1.5, 0.05);
    seen = inspect(made);
  });
  return { audio, ...seen };
}

/** Summed amplitude of the harmonics of 220 Hz above 6 kHz. */
function highEnergy(r: Rendered): number {
  let sum = 0;
  for (let k = 30; k <= 60; k++) sum += toneAmplitude(r, 220 * k, 0.1, 0.4);
  return sum;
}

describe('PolySynth plays the oscillator, envelope and filter the editor shows (General MIDI guitar)', () => {
  // Entry point: ToneEngine.getInstrument, the call the replayer (channel < 100, monophonic) and the keyboard
  // (channel >= 100, polyphonic) make. It only builds here (its effect chain wires to the engine bus), so the
  // structure of what it made is read; the audio below is rendered from the same builder the engine calls.
  it.each(PATHS)('$name: the engine builds a sawtooth voice with a static 3500 Hz cutoff', ({ channel }) => {
    const made = engine.getInstrument(guitar.id, guitar, channel) as object;
    const { oscType, filterHz } = inspect(made);
    engine.disposeInstrument(guitar.id);
    expect(oscType).toMatch(/sawtooth/); // the top-level oscillator reached the voice
    expect(filterHz).toBeCloseTo(3500, 0); // sentinel: config.filter reached the node as a static (non-sweeping) cutoff
  });

  it.each(PATHS)('$name: sustain 0.1 honoured, far less above 6 kHz than the unfiltered voice', async ({ channel }) => {
    const mono = channel < 100;
    const build = (cfg: InstrumentConfig) => () =>
      createToneSynthNode(toneVoiceTypeOf(cfg), cfg, { monophonic: mono, polyphony: cfg.polySynth?.voiceCount }) as unknown as Playable;
    const { audio } = await play(build(guitar));
    const open = await play(build({ ...guitar, filter: undefined } as unknown as InstrumentConfig));

    // sustain 0.1: the level decays from the first 100 ms to the held note at 1 s
    const early = rms(audio, 0.06, 0.16);
    const held = rms(audio, 0.95, 1.15);
    expect(early).toBeGreaterThan(0.001);
    expect(held).toBeLessThan(early * 0.35);

    expect(highEnergy(audio)).toBeLessThan(highEnergy(open.audio) * 0.2);
  }, 120000);
});
