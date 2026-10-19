/**
 * Every new instrument starts at the volume the normalisation offsets were
 * measured against.
 *
 * createDefaultInstrument gave volume 0 while getInitialConfig gave -12, and
 * getNormalizedVolume adds per-synth offsets (TB303 +15, DrumMachine +18)
 * calibrated at -12. Instruments made through createInstrument (the MCP and
 * the instrument list) therefore played 12 dB hotter than preset-loaded ones
 * and drove the safety limiter (2026-10-19).
 */
import { describe, it, expect } from 'vitest';
import { createDefaultInstrument, getInitialConfig } from '../instrument/presetOps';
import { DEFAULT_INSTRUMENT_VOLUME_DB, getNormalizedVolume } from '../../engine/factories/volumeNormalization';

describe('new instrument volume', () => {
  it('is the same from createDefaultInstrument and getInitialConfig', () => {
    expect(createDefaultInstrument(1).volume).toBe(DEFAULT_INSTRUMENT_VOLUME_DB);
    // A type with no factory preset exposes the base config; a preset may set its own volume.
    expect(getInitialConfig('NoSuchSynthType').volume).toBe(DEFAULT_INSTRUMENT_VOLUME_DB);
  });

  it('is the volume the normalisation offsets are calibrated at', () => {
    expect(getNormalizedVolume('TB303', undefined)).toBe(getNormalizedVolume('TB303', DEFAULT_INSTRUMENT_VOLUME_DB));
    expect(getNormalizedVolume('TB303', createDefaultInstrument(1).volume)).toBe(getNormalizedVolume('TB303', undefined));
  });
});
