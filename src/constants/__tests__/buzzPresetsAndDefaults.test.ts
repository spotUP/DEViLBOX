/**
 * Buzz instruments: one preset list, and a default machine that makes sound.
 *
 * Owner, 2026-09-30 (screenshot): the Buzz editor had its own preset box
 * (stuck on "Select preset...") while the header's preset dropdown, the one
 * every other synth uses, was empty - only the generators' presets were
 * registered, under their own synth types. And "the buzzmachine synth is
 * silent": the generic Buzzmachine synth defaulted to Arguru Distortion, an
 * effect, which is silent as an instrument.
 */
import { describe, it, expect } from 'vitest';
import { FACTORY_PRESETS } from '../factoryPresets';
import { defaultBuzzmachineFor, DEFAULT_BUZZMACHINE } from '@/types/instrument';

describe('Buzz presets and defaults', () => {
  it('every Buzz machine preset is listed for the generic Buzzmachine synth, with its machine', () => {
    const generic = FACTORY_PRESETS.filter((p) => p.synthType === 'Buzzmachine');
    expect(generic.some((p) => p.buzzmachine?.machineType === 'ArguruDistortion' && p.name === 'Buzz Soft Clip')).toBe(true);
    expect(generic.every((p) => !!p.buzzmachine?.machineType)).toBe(true);
  });

  it('a Buzz synth type gets its own machine, and the generic one a generator', () => {
    expect(defaultBuzzmachineFor('BuzzTrilok').machineType).toBe('JeskolaTrilok');
    expect(defaultBuzzmachineFor('BuzzFreqBomb').machineType).toBe('ElenzilFrequencyBomb');
    expect(DEFAULT_BUZZMACHINE.machineType).not.toBe('ArguruDistortion');
    expect(defaultBuzzmachineFor('Buzzmachine').machineType).toBe(DEFAULT_BUZZMACHINE.machineType);
  });
});
