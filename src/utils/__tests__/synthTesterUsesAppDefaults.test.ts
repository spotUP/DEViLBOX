import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InstrumentConfig } from '@typedefs/instrument';

const calls: string[] = [];
let captured: InstrumentConfig | null = null;

vi.mock('@engine/InstrumentFactory', async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  return {
    ...actual,
    InstrumentFactory: {
      createInstrument: (config: InstrumentConfig) => {
        calls.push('create');
        captured = config;
        return null;
      },
    },
  };
});

vi.mock('@engine/registry/SynthRegistry', () => ({
  SynthRegistry: {
    ensure: vi.fn(async () => {
      calls.push('ensure');
      return undefined;
    }),
    knows: () => true,
  },
}));

import { testSynth } from '../synthTester';
import { SynthRegistry } from '@engine/registry/SynthRegistry';

describe('synthTester builds instruments like the app', () => {
  beforeEach(() => {
    calls.length = 0;
    captured = null;
  });

  it('applies the synth-type defaults a real switch applies', async () => {
    await testSynth('FurnaceSID6581');
    expect(captured!.furnace?.chipType).toBeDefined();
    expect(captured!.synthType).toBe('FurnaceSID6581');

    await testSynth('DubSiren');
    expect(captured!.dubSiren).toBeDefined();
  });

  it('ensures the lazy synth is registered before creating it', async () => {
    await testSynth('MAMETIA');
    expect(SynthRegistry.ensure).toHaveBeenCalledWith('MAMETIA');
    expect(calls).toEqual(['ensure', 'create']);
  });
});
