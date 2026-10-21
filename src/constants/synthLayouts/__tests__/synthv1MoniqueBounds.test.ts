/**
 * LAYOUT-BOUNDS-VS-ENGINE: the SynthV1 and Monique layout knobs must span the engine's real parameter range, because the knob
 * value reaches the engine unscaled (SynthV1Synth.set posts the raw value; MoniqueSynth.set posts it to
 * juce-wasm/monique/MoniqueSynth.cpp, which calls set_value(value) on the upstream parameter). A layout bounded 0..1 over a
 * -1..1 or 0..360 engine parameter silently clips the upper or lower part of the range.
 *
 * SynthV1 ranges come from SYNTHV1_PARAMS (generated from third-party/synthv1/src/synthv1_param.cpp). Monique has no TS table, so
 * its ranges are written here from third-party/monique-monosynth/src/core/monique_core_Datastructures.cpp:
 * input_sustains MIN_MAX(id_ == 0 ? 0 : -1, 1) (filter 1 is unipolar, filters 2 and 3 bipolar) and delay_pan MIN_MAX(-1, 1).
 */
import { describe, it, expect } from 'vitest';
import type { ControlDescriptor, SynthPanelLayout } from '@/types/synthPanel';
import { SYNTHV1_LAYOUT } from '../synthv1';
import { MONIQUE_LAYOUT } from '../monique';
import { SYNTHV1_PARAMS } from '@/lib/presetImport/tables/synthv1Params';
import { SYNTHV1_PRESETS, DEFAULT_SYNTHV1 } from '@/engine/synthv1/SynthV1Synth';
import { MONIQUE_PRESETS, DEFAULT_MONIQUE } from '@/engine/monique/MoniqueSynth';

function controls(layout: SynthPanelLayout): Map<string, ControlDescriptor> {
  const sections = [...(layout.sections ?? []), ...(layout.tabs ?? []).flatMap((t) => t.sections)];
  return new Map(sections.flatMap((s) => s.controls).map((c) => [c.key, c]));
}

const sv1 = controls(SYNTHV1_LAYOUT);
const monique = controls(MONIQUE_LAYOUT);

const SV1_KEYS = [
  'lfo1Bpm', 'lfo2Bpm', 'delayBpm',
  'lfo1Pitch', 'lfo1Cutoff', 'lfo1Reso', 'lfo1Volume',
  'lfo2Pitch', 'lfo2Cutoff', 'lfo2Reso', 'lfo2Volume',
  'dcf1Envelope', 'dcf2Envelope', 'dcf1Slope', 'dcf2Slope',
];

const MONIQUE_RANGES: Record<string, [number, number]> = {
  filter1Input0: [0, 1], filter1Input1: [0, 1], filter1Input2: [0, 1],
  filter2Input0: [-1, 1], filter2Input1: [-1, 1], filter2Input2: [-1, 1],
  filter3Input0: [-1, 1], filter3Input1: [-1, 1], filter3Input2: [-1, 1],
  delayPan: [-1, 1],
};

describe('SynthV1 layout bounds equal the engine ranges (LAYOUT-BOUNDS-VS-ENGINE)', () => {
  it.each(SV1_KEYS)('%s', (key) => {
    const row = SYNTHV1_PARAMS.find((p) => p[5] === key);
    expect(row, `${key} must exist in SYNTHV1_PARAMS`).toBeDefined();
    const [, , , min, max] = row!;
    const c = sv1.get(key)!;
    expect(c, `${key} must be in SYNTHV1_LAYOUT`).toBeDefined();
    if (c.type === 'select') {
      expect(c.options.map((o) => Number(o.value))).toEqual(Array.from({ length: max - min + 1 }, (_, i) => min + i));
    } else if (c.type === 'knob') {
      expect([c.min, c.max]).toEqual([min, max]);
    } else {
      throw new Error(`${key}: unexpected control type ${c.type}`);
    }
  });

  it('every knob default and every preset value for those keys lies inside the engine range', () => {
    for (const key of SV1_KEYS) {
      const [, , , min, max] = SYNTHV1_PARAMS.find((p) => p[5] === key)!;
      const values = [(DEFAULT_SYNTHV1 as unknown as Record<string, number>)[key],
        ...Object.values(SYNTHV1_PRESETS).map((p) => (p as Record<string, number | undefined>)[key])]
        .filter((v): v is number => typeof v === 'number');
      for (const v of values) expect(v >= min && v <= max, `${key}=${v}`).toBe(true);
    }
  });
});

describe('Monique layout bounds equal the engine ranges (LAYOUT-BOUNDS-VS-ENGINE)', () => {
  it.each(Object.keys(MONIQUE_RANGES))('%s', (key) => {
    const c = monique.get(key)!;
    expect(c, `${key} must be in MONIQUE_LAYOUT`).toBeDefined();
    if (c.type !== 'knob') throw new Error(`${key}: expected knob`);
    expect([c.min, c.max]).toEqual(MONIQUE_RANGES[key]);
  });

  it('every default and preset value for those keys lies inside the engine range', () => {
    for (const [key, [min, max]] of Object.entries(MONIQUE_RANGES)) {
      const values = [(DEFAULT_MONIQUE as Record<string, number | undefined>)[key],
        ...Object.values(MONIQUE_PRESETS).map((p) => (p as Record<string, number | undefined>)[key])]
        .filter((v): v is number => typeof v === 'number');
      for (const v of values) expect(v >= min && v <= max, `${key}=${v}`).toBe(true);
    }
  });
});
