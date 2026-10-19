/**
 * A synth's level offset lives in exactly one place: its registry descriptor's volumeOffsetDb for registered synths,
 * VOLUME_NORMALIZATION_OFFSETS in volumeNormalization.ts for the unregistered rest. Two tables once disagreed (TB303
 * +15 at creation, +1 on a live volume change), so a volume move changed the level by the difference.
 */
import { describe, it, expect } from 'vitest';
import { SynthRegistry } from '../SynthRegistry';
import '../builtin'; // side effect: registers every built-in synth eagerly
import '../sdk'; // side effect: registers every SDK synth id (lazily, so no WASM loads here)
import { VOLUME_NORMALIZATION_OFFSETS, getNormalizedVolume, instrumentOffsetDb } from '../../factories/volumeNormalization';

describe('volume offsets have a single source', () => {
  it('no synth type is listed in both the registry and the central table', () => {
    const registered = SynthRegistry.getAllIds(); // registered and lazily registered ids alike
    expect(registered.length).toBeGreaterThan(100);
    const inBoth = registered.filter((id) => id in VOLUME_NORMALIZATION_OFFSETS);
    expect(inBoth).toEqual([]);
  });

  it('a registered synth takes its offset from the descriptor (TB303 +1 dB)', () => {
    expect(SynthRegistry.get('TB303')?.volumeOffsetDb).toBe(1);
    expect(instrumentOffsetDb('TB303')).toBe(1);
    expect(getNormalizedVolume('TB303', -12)).toBe(-11);
  });

  it('an unregistered synth takes its offset from the central table (DrumMachine +18 dB)', () => {
    expect(SynthRegistry.get('DrumMachine')).toBeUndefined();
    expect(getNormalizedVolume('DrumMachine', -12)).toBe(6);
  });
});
