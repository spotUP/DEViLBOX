/**
 * chipParameterInit.test.ts — a fresh chip must be initialized to the state
 * the UI claims it is in.
 *
 * Stored instrument parameters are sparse: only what the user has touched ever
 * gets written. Creation used to send exactly those keys, so every untouched
 * parameter stayed at the C++ constructor's value while the editor displayed
 * the DECLARED default from chipParameters. A fresh TMS5220 therefore spoke
 * with a half-configured chip that no control on screen reflected, and picking
 * any voice preset "fixed" it only because a preset writes a complete set.
 *
 * These tests assert the parameters actually REACH the synth — a call-count
 * sentinel, not just a resolver returning a nice object.
 */
import { describe, it, expect } from 'vitest';
import { applyChipParameters } from '../sdk/mame';
import { resolveChipParameters, CHIP_SYNTH_DEFS } from '../../../constants/chipParameters';
import type { InstrumentConfig } from '@typedefs/instrument';

/** Records every setParam/loadPreset the creation path performs. */
function recordingSynth() {
  const sent = new Map<string, number>();
  const presets: number[] = [];
  return {
    sent,
    presets,
    setParam: (key: string, value: number) => { sent.set(key, value); },
    loadPreset: (index: number) => { presets.push(index); },
  };
}

function chipConfig(parameters: Record<string, number | string>): InstrumentConfig {
  return {
    id: 1,
    name: 'Chip',
    type: 'synth',
    synthType: 'MAMETMS5220',
    volume: -8,
    pan: 0,
    effects: [],
    parameters,
  } as unknown as InstrumentConfig;
}

/** Numeric parameters the TMS5220 declares (what the editor renders as knobs). */
function declaredNumericKeys(synthType: string): string[] {
  return CHIP_SYNTH_DEFS[synthType].parameters
    .filter((p) => p.type !== 'text' && p.type !== 'vowelEditor')
    .filter((p) => typeof p.default === 'number')
    .map((p) => p.key);
}

describe('chip parameter initialization', () => {
  it('sends every declared parameter when the stored set is sparse', () => {
    // Exactly the shape a real instrument had: a handful of touched knobs.
    const synth = recordingSynth();
    applyChipParameters(synth, chipConfig({
      _romsLoaded: 1,
      sing_mode: 0,
      speechText: 'world',
      energy_index: 15,
      pitch_index: 8,
    }));

    for (const key of declaredNumericKeys('MAMETMS5220')) {
      expect(synth.sent.has(key), `${key} never reached the chip`).toBe(true);
    }
    // Untouched parameters arrive at their DECLARED default, not the chip's.
    expect(synth.sent.get('k1_index')).toBe(15);
    expect(synth.sent.get('brightness')).toBe(0.5);
    // Touched ones keep the stored value.
    expect(synth.sent.get('energy_index')).toBe(15);
    expect(synth.sent.get('pitch_index')).toBe(8);
  });

  it('initializes a chip with no stored parameters at all', () => {
    const synth = recordingSynth();
    applyChipParameters(synth, chipConfig({}));
    for (const key of declaredNumericKeys('MAMETMS5220')) {
      expect(synth.sent.has(key), `${key} never reached the chip`).toBe(true);
    }
  });

  it('loads a chip preset before the parameter writes that refine it', () => {
    const synth = recordingSynth();
    applyChipParameters(synth, chipConfig({ _program: 3, k1_index: 20 }));
    expect(synth.presets).toEqual([3]);
    expect(synth.sent.get('k1_index')).toBe(20);
    // _program is a chip-preset selector, not a chip register.
    expect(synth.sent.has('_program')).toBe(false);
  });

  it('resolves declared defaults with stored values winning', () => {
    const resolved = resolveChipParameters('MAMETMS5220', { pitch_index: 8, speechText: 'hi' });
    expect(resolved.pitch_index).toBe(8);
    expect(resolved.k2_index).toBe(15);
    // Text parameters are not chip registers.
    expect(resolved.speechText).toBeUndefined();
  });
});
