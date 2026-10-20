/**
 * Picking a ChipSynth preset (PresetDropdown -> store updateInstrument ->
 * engine.updateComplexSynthParameters -> voice.applyConfig) must switch the
 * arpeggio on even when the voice was built with it off, and a live key must
 * then arpeggiate instead of plucking once.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const clocks: Array<{ cb: () => void; started: boolean }> = [];
const attacks: string[] = [];

vi.mock('tone', () => {
  class Clock {
    frequency = { value: 0 };
    private entry: { cb: () => void; started: boolean };
    constructor(opts: { callback: () => void; frequency: number }) {
      this.entry = { cb: opts.callback, started: false };
      clocks.push(this.entry);
    }
    start() { this.entry.started = true; return this; }
    stop() { this.entry.started = false; return this; }
    dispose() { return this; }
  }
  class PolySynth {
    volume = { value: 0 };
    constructor(_v: unknown, _o: unknown) {}
    connect() { return this; }
    set() {}
    triggerAttack(n: string) { attacks.push(`A:${n}`); }
    triggerAttackRelease(n: string) { attacks.push(`AR:${n}`); }
    triggerRelease() {}
    releaseAll() {}
    dispose() {}
  }
  class BitCrusher {
    bits = { value: 8 };
    constructor(_b: number) {}
    connect() { return this; }
    disconnect() { return this; }
    dispose() {}
  }
  return {
    Clock, PolySynth, BitCrusher,
    Synth: class {},
    NoiseSynth: class {},
    Time: (v: number | string) => ({ toSeconds: () => (typeof v === 'number' ? v : 0.25) }),
    now: () => 0,
    getContext: () => ({ setTimeout: () => 0 }),
    getTransport: () => ({ bpm: { value: 120 }, state: 'stopped' }),
  };
});

import { createChipSynth } from '../factories/ToneJSSynthFactory';
import { updateComplexSynthParameters } from '../tone/SynthParameterUpdates';
import { CHIP_PRESETS } from '@constants/factoryPresets/chip';
import { DEFAULT_CHIP_SYNTH } from '@typedefs/instrument';
import type { InstrumentConfig } from '@typedefs/instrument';

beforeEach(() => { clocks.length = 0; attacks.length = 0; });

describe('ChipSynth preset apply enables the arpeggio', () => {
  it('a voice built with the arpeggio off arpeggiates after a preset enables it', () => {
    const preset = CHIP_PRESETS.find((p) => p.chipSynth?.arpeggio?.enabled && (p.chipSynth.arpeggio.steps?.length ?? 0) > 1)!;
    expect(preset).toBeDefined();

    const built = {
      synthType: 'ChipSynth',
      volume: -12,
      chipSynth: { ...DEFAULT_CHIP_SYNTH, arpeggio: { ...(DEFAULT_CHIP_SYNTH.arpeggio ?? preset.chipSynth!.arpeggio!), enabled: false } },
    } as unknown as InstrumentConfig;
    const voice = createChipSynth(built) as unknown as { triggerAttack: (n: string) => void };

    // What the store hands the engine after PresetDropdown.applyPreset.
    updateComplexSynthParameters({
      instruments: new Map([[1 << 16, voice]]),
      instrumentIdFromKey: (k: number) => k >> 16,
    } as unknown as Parameters<typeof updateComplexSynthParameters>[0], 1, preset.chipSynth);

    voice.triggerAttack('C4');
    expect(clocks).toHaveLength(1);
    expect(clocks[0].started).toBe(true);
    clocks[0].cb();
    clocks[0].cb();
    // arp steps drove the synth; a plain pluck would have been a single 'A:C4'
    expect(attacks).not.toContain('A:C4');
    expect(attacks.filter((a) => a.startsWith('AR:')).length).toBeGreaterThanOrEqual(2);
  });
});
