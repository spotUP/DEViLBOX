/**
 * Every guitar amp model comes out at its input's level at its defaults.
 *
 * Owner, 2026-09-30: "loudness change a lot on some of the presets it gets
 * lower volume". On the owner's song the quiet presets were the guitar ones,
 * 3.6-9.4 dB down: the models come out at their training level, measured
 * -17.5 dB (Big Muff V6) to +8.9 dB at defaults. The correction sits in
 * GuitarMLEngine, which the master effect and the instrument pedalboard both
 * use; re-measured live after, every model checked read 0.0 +- 0.1 dB.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GUITARML_MODEL_REGISTRY, NEURAL_MODEL_OUTPUT_DB, neuralModelOutputGain } from '../guitarMLRegistry';

describe('neural model output level', () => {
  it('has one correction per model, index-aligned', () => {
    expect(NEURAL_MODEL_OUTPUT_DB.length).toBe(GUITARML_MODEL_REGISTRY.length);
    expect(20 * Math.log10(neuralModelOutputGain(36))).toBeCloseTo(17.5, 5); // Big Muff V6
    expect(neuralModelOutputGain(999)).toBe(1);
  });

  it('is applied where every model is loaded', () => {
    const engine = readFileSync(join(process.cwd(), 'src/engine/GuitarMLEngine.ts'), 'utf8');
    expect(engine).toContain('this.outputGain.gain.value = neuralModelOutputGain(modelIndex);');
  });
});
