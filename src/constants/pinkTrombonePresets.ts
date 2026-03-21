import type { InstrumentPreset } from '@typedefs/instrument';
import type { PinkTromboneConfig } from '@engine/pinktrombone/PinkTromboneSynth';
import { PINK_TROMBONE_PRESETS, DEFAULT_PINK_TROMBONE } from '@engine/pinktrombone/PinkTromboneSynth';

function makePreset(name: string, overrides: Partial<PinkTromboneConfig>): InstrumentPreset['config'] {
  return {
    type: 'synth',
    name,
    synthType: 'PinkTrombone',
    pinkTrombone: { ...DEFAULT_PINK_TROMBONE, ...overrides, preset: name },
    effects: [],
    volume: -8,
    pan: 0,
  };
}

export const PINK_TROMBONE_FACTORY_PRESETS: InstrumentPreset['config'][] = Object.entries(PINK_TROMBONE_PRESETS).map(
  ([name, overrides]) => makePreset(name, overrides)
);
