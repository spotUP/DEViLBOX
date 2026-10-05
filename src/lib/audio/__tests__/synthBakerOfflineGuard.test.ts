/**
 * The instrument classifier bakes every synth of a freshly loaded song through
 * SynthBaker, which renders in an OfflineAudioContext. A synth with an engine
 * of its own (the Furnace dispatch worklet, a WAM, a native player) ignores
 * that context: baking one captured silence and played its C-4 LIVE on the
 * running engine — for a Furnace song, on the song's own chip, mid-playback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createInstrument } = vi.hoisted(() => ({ createInstrument: vi.fn() }));
vi.mock('@engine/InstrumentFactory', () => ({ InstrumentFactory: { createInstrument } }));

import { SynthBaker } from '../SynthBaker';
import { SynthRegistry } from '@engine/registry/SynthRegistry';
import type { SynthDescriptor } from '@engine/registry/SynthDescriptor';
import type { InstrumentConfig } from '@typedefs/instrument';

const desc = (id: string, category: SynthDescriptor['category']) =>
  ({ id, name: id, category, loadMode: 'eager', create: () => ({}) }) as unknown as SynthDescriptor;
const config = (synthType: string) => ({ id: 1, name: 'x', synthType }) as unknown as InstrumentConfig;

beforeEach(() => {
  createInstrument.mockReset();
  SynthRegistry.register([desc('TestLiveEngineSynth', 'wasm'), desc('TestToneSynth', 'tone')]);
});

describe('baking a synth to a sample', () => {
  it('refuses a synth with its own live engine instead of playing it live', async () => {
    await expect(SynthBaker.bakeToSample(config('TestLiveEngineSynth'), 0.1)).rejects.toThrow(/own live engine/);
    expect(createInstrument).not.toHaveBeenCalled();
  });

  it('knows which synths render into the offline context', async () => {
    expect(await SynthBaker.canRenderOffline(config('TestLiveEngineSynth'))).toBe(false);
    expect(await SynthBaker.canRenderOffline(config('TestToneSynth'))).toBe(true);
  });

  it('refuses a whole-song engine label (PSG play, TFM) instead of building a stand-in Tone.js synth', async () => {
    for (const t of ['PsgplaySynth', 'TFMSynth', 'MusicMakerSynth']) {
      expect(await SynthBaker.canRenderOffline(config(t))).toBe(false);
      await expect(SynthBaker.bakeToSample(config(t), 0.1)).rejects.toThrow();
    }
    expect(createInstrument).not.toHaveBeenCalled();
  });
});
