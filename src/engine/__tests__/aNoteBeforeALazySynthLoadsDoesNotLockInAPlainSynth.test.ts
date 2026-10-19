/**
 * A lazily registered synth type (SynthRegistry.registerLazy) is invisible to the sync SynthRegistry.get until its
 * loader has run. getInstrument used to create a plain Tone.js Synth for it ("Unknown synth type") and CACHE it under
 * the real type's name, so every later note on that instrument played the plain Synth even after the loader finished
 * (found on UpRoughSoftsynth: pattern notes played a default Synth). A cold call must cache nothing and start the
 * loader; once loaded, the next call creates the real synth.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import type { InstrumentConfig } from '@typedefs/instrument';
import { SynthRegistry } from '@/engine/registry/SynthRegistry';

type Engine = { getInstrument: (id: number, c: InstrumentConfig, ch?: number) => unknown };
let engine: Engine;
let Tone: typeof import('tone');

beforeAll(async () => {
  installRealWebAudio();
  Tone = await import('tone'); // after the real Web Audio is installed
  const { getToneEngine } = await import('../ToneEngine');
  engine = getToneEngine() as unknown as Engine;
}, 60000);

describe('a note before a lazy synth has loaded', () => {
  it('caches no stand-in and gets the real synth once the loader has run', async () => {
    const created: unknown[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let loaderRuns = 0;
    SynthRegistry.registerLazy(['LazyProbeSynth'], async () => {
      loaderRuns++;
      await gate;
      SynthRegistry.register({
        id: 'LazyProbeSynth', name: 'Lazy Probe', category: 'tone', loadMode: 'lazy',
        create: () => { const s = new Tone.Synth(); created.push(s); return s; },
      } as unknown as Parameters<typeof SynthRegistry.register>[0]);
    });
    const config = { id: 931, name: 'probe', type: 'synth', synthType: 'LazyProbeSynth', effects: [], volume: -6, pan: 0 } as unknown as InstrumentConfig;

    expect(engine.getInstrument(931, config, 0), 'no stand-in while the loader runs').toBeNull();
    expect(loaderRuns, 'the cold call started the loader').toBe(1);

    release();
    await SynthRegistry.ensure('LazyProbeSynth');
    const inst = engine.getInstrument(931, config, 0);
    expect(created.length, 'the real descriptor created the instrument').toBe(1);
    expect(inst).toBe(created[0]);
  });
});
