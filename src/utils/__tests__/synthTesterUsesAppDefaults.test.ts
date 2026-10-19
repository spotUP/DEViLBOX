import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InstrumentConfig } from '@typedefs/instrument';

let readied: InstrumentConfig | null = null;
const attacks: Array<{ id: number; note: string }> = [];
let peak = 0;

const engine = {
  ensureInstrumentReady: vi.fn(async (config: InstrumentConfig) => { readied = config; }),
  getInstrumentAnalyser: vi.fn(() => ({ getPeak: () => peak })),
  triggerNoteAttack: vi.fn((id: number, note: string) => { attacks.push({ id, note }); }),
  triggerNoteRelease: vi.fn(),
  instancesOf: vi.fn(() => [{}]),
  disposeInstrumentAnalyser: vi.fn(),
  disposeInstrument: vi.fn(),
};

vi.mock('@engine/ToneEngine', () => ({ getToneEngine: () => engine }));

import { testSynth } from '../synthTester';

describe('synthTester plays synths through the app engine path', () => {
  beforeEach(() => {
    readied = null;
    attacks.length = 0;
    peak = 0;
    vi.clearAllMocks();
  });

  it('applies the synth-type defaults a real switch applies', async () => {
    await testSynth('FurnaceSID6581');
    expect(readied!.furnace?.chipType).toBeDefined();
    expect(readied!.synthType).toBe('FurnaceSID6581');

    await testSynth('DubSiren');
    expect(readied!.dubSiren).toBeDefined();
  });

  it('triggers the note on the engine and hears it on the engine analyser', async () => {
    peak = 0.2;
    const result = await testSynth('DubSiren');
    expect(attacks).toEqual([{ id: 32000, note: 'C4' }]);
    expect(result.producedSound).toBe(true);
    expect(engine.disposeInstrument).toHaveBeenCalledWith(32000);
  });

  it('skips whole-song replayer types instead of reporting them silent', async () => {
    const result = await testSynth('SidMon2Synth');
    expect(engine.ensureInstrumentReady).not.toHaveBeenCalled();
    expect(result.error).toMatch(/whole-song/);
  });
});
