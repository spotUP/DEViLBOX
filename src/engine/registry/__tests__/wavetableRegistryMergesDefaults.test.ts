/**
 * Owner 2026-10-20: the Wavetable synth was silent and every note threw
 * "Cannot read properties of undefined (reading 'voices') at new WavetableVoice".
 * The registry descriptor (registry/sdk/misc.ts) passed the whole InstrumentConfig
 * to WavetableSynth instead of config.wavetable merged over DEFAULT_WAVETABLE, and
 * the registry is checked before the legacy switch, so createWavetable never ran.
 * This drives the real InstrumentFactory entry point and records what the synth
 * constructor receives.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const received: Array<Record<string, any>> = [];
vi.mock('../../WavetableSynth', () => ({
  WavetableSynth: class {
    output = { gain: { value: 1 } };
    constructor(cfg: Record<string, any>) {
      received.push(cfg);
      // The real voice reads these at construction.
      void cfg.unison.voices; void cfg.filter.type; void cfg.envelope.attack;
    }
    dispose() {}
  },
}));

import '../sdk/misc';
import { InstrumentFactory } from '../../InstrumentFactory';
import { DEFAULT_WAVETABLE } from '@/types/instrument';
import type { InstrumentConfig } from '@/types/instrument';

function wavetable(extra: Partial<InstrumentConfig>): InstrumentConfig {
  return { id: 1, name: 'Wavetable', type: 'synth', synthType: 'Wavetable', volume: -12, pan: 0, effects: [], ...extra } as InstrumentConfig;
}

describe('Wavetable from the registry gets the merged wavetable config', () => {
  beforeEach(() => { received.length = 0; });

  it('no wavetable block: the defaults', () => {
    expect(() => InstrumentFactory.createInstrument(wavetable({}))).not.toThrow();
    expect(received).toHaveLength(1);
    expect(received[0].unison.voices).toBe(DEFAULT_WAVETABLE.unison.voices);
  });

  it('a partial wavetable block (no unison): its own fields over the defaults', () => {
    const partial = { ...DEFAULT_WAVETABLE, unison: undefined, filter: { ...DEFAULT_WAVETABLE.filter, cutoff: 1234 } };
    expect(() => InstrumentFactory.createInstrument(wavetable({ wavetable: partial as never }))).not.toThrow();
    expect(received[0].unison.voices).toBe(DEFAULT_WAVETABLE.unison.voices);
    expect(received[0].filter.cutoff).toBe(1234);
  });
});
