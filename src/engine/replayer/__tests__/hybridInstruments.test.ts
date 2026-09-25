/**
 * "it plays but it sounds out of tune" (2026-09-25) — every DefleMask and
 * Furnace song, in the browser only.
 *
 * Hybrid playback fires ToneEngine notes for "replaced" instruments on top of
 * a whole-song engine. The rule counted every instrument that was not a
 * Sampler/Player or a listed whole-player type — and a Furnace song's own
 * instruments (FurnaceOPN, FurnacePSG…) are neither. So each note went out
 * twice on the same chip channel: once from the WASM sequencer, once through
 * the instrument's synth with a forced instrument and full volume. Measured by
 * lock-stepping the browser's chip commands against Furnace: 160 of 1525
 * ticks matched before, 201 of 201 after.
 */
import { describe, it, expect } from 'vitest';
import { isReplacedInstrument } from '../hybridInstruments';
import type { InstrumentConfig } from '@typedefs/instrument';

const ins2 = new Uint8Array([0x49, 0x4e, 0x53, 0x32, 1, 2, 3]);
const inst = (synthType: string, furnace?: object) =>
  ({ id: 1, name: 'x', synthType, ...(furnace ? { furnace } : {}) }) as unknown as InstrumentConfig;

describe('which instruments hybrid playback plays itself', () => {
  it('leaves a Furnace song\'s own instruments to the Furnace sequencer', () => {
    expect(isReplacedInstrument(inst('FurnaceOPN', { rawBinaryData: ins2 }), true)).toBe(false);
    expect(isReplacedInstrument(inst('FurnacePSG', { rawBinaryData: ins2 }), true)).toBe(false);
  });

  it('still plays an instrument the user swapped in, which carries no INS2', () => {
    expect(isReplacedInstrument(inst('FurnaceOPN'), true)).toBe(true);
    expect(isReplacedInstrument(inst('TB303'), true)).toBe(true);
  });

  it('plays a Furnace instrument when no Furnace sequencer drives the song', () => {
    expect(isReplacedInstrument(inst('FurnaceOPN', { rawBinaryData: ins2 }), false)).toBe(true);
  });

  it('never plays samples or whole-player instruments', () => {
    expect(isReplacedInstrument(inst('Sampler'), true)).toBe(false);
    expect(isReplacedInstrument(inst('Player'), false)).toBe(false);
    expect(isReplacedInstrument(inst('HivelySynth'), false)).toBe(false);
  });
});
